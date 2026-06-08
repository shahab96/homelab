import { Construct } from "constructs";
import { DataKubernetesSecretV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-secret-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { SecretV1 } from "@cdktf/provider-kubernetes/lib/secret-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { PublicIngressRoute } from "../../utils";

type PackageProxyOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;
  host: string;
};

export class PackageProxy extends Construct {
  constructor(scope: Construct, id: string, opts: PackageProxyOptions) {
    super(scope, id);

    const { provider, namespace, name, host } = opts;

    const pgAdminCert = new DataKubernetesSecretV1(this, "admin-pg-cert", {
      provider,
      metadata: {
        name: "shahab-client-cert",
        namespace: "homelab",
      },
    });

    const pgCaCert = new DataKubernetesSecretV1(this, "pg-ca-cert", {
      provider,
      metadata: {
        name: "postgres-server-cert",
        namespace: "homelab",
      },
    });

    new SecretV1(this, "admin-pg-ssl", {
      provider,
      metadata: {
        name: `${name}-admin-pg-ssl-bundle`,
        namespace,
      },
      data: {
        "tls.crt": pgAdminCert.data.lookup("tls.crt"),
        "tls.key": pgAdminCert.data.lookup("tls.key"),
        "ca.crt": pgCaCert.data.lookup("ca.crt"),
      },
    });

    const pgRuntimeCert = new DataKubernetesSecretV1(this, "runtime-pg-cert", {
      provider,
      metadata: {
        name: "package-proxy-client-cert",
        namespace: "homelab",
      },
    });

    new SecretV1(this, "runtime-pg-ssl", {
      provider,
      metadata: {
        name: `${name}-pg-ssl-bundle`,
        namespace,
      },
      data: {
        "tls.crt": pgRuntimeCert.data.lookup("tls.crt"),
        "tls.key": pgRuntimeCert.data.lookup("tls.key"),
        "ca.crt": pgCaCert.data.lookup("ca.crt"),
      },
    });

    const bootstrapJob = new Manifest(this, "db-bootstrap", {
      provider,
      manifest: {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
          name: `${name}-db-bootstrap`,
          namespace,
        },
        spec: {
          ttlSecondsAfterFinished: 300,
          template: {
            spec: {
              restartPolicy: "Never",
              container: [
                {
                  name: "bootstrap",
                  image: "postgres:18-alpine",
                  command: ["sh", "-c"],
                  args: [
                     `psql "\$\${PGURL}" -c "DO \\$\\$ BEGIN CREATE ROLE \\"package-proxy\\" WITH LOGIN; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'role exists'; END \\$\\$;" &&
                       psql "\$\${PGURL}" -c "CREATE DATABASE \\"package-proxy\\" OWNER \\"package-proxy\\";" 2>/dev/null || true`,
                  ],
                  env: [
                    {
                      name: "PGURL",
                      value: "postgres://shahab@postgres-cluster-rw.homelab.svc.cluster.local:5432/postgres?sslmode=verify-full&sslrootcert=/etc/postgres/ca.crt&sslcert=/etc/postgres/tls.crt&sslkey=/etc/postgres/tls.key",
                    },
                  ],
                  envFrom: [
                    {
                      secretRef: { name: `${name}-admin-pg-ssl-bundle` },
                    },
                  ],
                  volumeMount: [
                    {
                      name: "pg-admin-ssl",
                      mountPath: "/etc/postgres",
                      readOnly: true,
                    },
                  ],
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    capabilities: { drop: ["ALL"] },
                    runAsNonRoot: true,
                    runAsUser: 70,
                    seccompProfile: { type: "RuntimeDefault" },
                  },
                },
              ],
              volume: [
                {
                  name: "pg-admin-ssl",
                  secret: {
                    secretName: `${name}-admin-pg-ssl-bundle`,
                    defaultMode: "0600",
                  },
                },
              ],
            },
          },
        },
      },
    });

    const deployment = new DeploymentV1(this, "deployment", {
      provider,
      metadata: {
        name,
        namespace,
      },
      spec: {
        replicas: "1",
        strategy: {
          type: "Recreate",
        },
        selector: {
          matchLabels: {
            app: name,
          },
        },
        template: {
          metadata: {
            labels: {
              app: name,
            },
          },
          spec: {
            nodeSelector: {
              nodepool: "worker",
            },
            volume: [
              {
                name: "pg-ssl",
                secret: {
                  secretName: `${name}-pg-ssl-bundle`,
                  defaultMode: "0600",
                },
              },
              {
                name: "rustfs-ca",
                configMap: { name: "rustfs-ca" },
              },
            ],
            container: [
              {
                name,
                image: "ghcr.io/git-pkgs/proxy:v0.5.0",
                env: [
                  { name: "PROXY_LISTEN", value: ":3141" },
                  {
                    name: "PROXY_BASE_URL",
                    value: `https://${host}`,
                  },
                  {
                    name: "PROXY_DATABASE_DRIVER",
                    value: "postgres",
                  },
                  {
                    name: "PROXY_DATABASE_URL",
                     value: "postgres://package-proxy@postgres-cluster-rw.homelab.svc.cluster.local:5432/package-proxy?sslmode=verify-full&sslrootcert=/etc/postgres/ca.crt&sslcert=/etc/postgres/tls.crt&sslkey=/etc/postgres/tls.key",
                  },
                  {
                    name: "PROXY_STORAGE_URL",
                     value: "s3://package-proxy?region=us-east-1&endpoint=https://rustfs-tenant-io.homelab.svc.cluster.local:9000&s3ForcePathStyle=true",
                  },
                  { name: "AWS_REGION", value: "us-east-1" },
                  {
                    name: "AWS_ACCESS_KEY_ID",
                    valueFrom: {
                      secretKeyRef: {
                        name: "rustfs-credentials",
                        key: "accesskey",
                      },
                    },
                  },
                  {
                    name: "AWS_SECRET_ACCESS_KEY",
                    valueFrom: {
                      secretKeyRef: {
                        name: "rustfs-credentials",
                        key: "secretkey",
                      },
                    },
                  },
                  {
                    name: "SSL_CERT_FILE",
                    value: "/etc/ssl/certs/rustfs-ca.crt",
                  },
                ],
                port: [
                  {
                    name: "http",
                    containerPort: 3141,
                  },
                ],
                resources: {
                  limits: { cpu: "1", memory: "2Gi" },
                },
                volumeMount: [
                  {
                    name: "pg-ssl",
                    mountPath: "/etc/postgres",
                    readOnly: true,
                  },
                  {
                    name: "rustfs-ca",
                    mountPath: "/etc/ssl/certs/rustfs-ca.crt",
                    subPath: "ca.crt",
                  },
                ],
                livenessProbe: {
                  httpGet: { path: "/health", port: "3141" },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                },
                readinessProbe: {
                  httpGet: { path: "/health", port: "3141" },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                },
              },
            ],
          },
        },
      },
    });

    deployment.node.addDependency(bootstrapJob);

    new ServiceV1(this, "service", {
      provider,
      metadata: {
        name,
        namespace,
      },
      spec: {
        selector: {
          app: name,
        },
        port: [
          {
            port: 3141,
            targetPort: "3141",
          },
        ],
        type: "ClusterIP",
      },
    });

    new PublicIngressRoute(this, "ingress", {
      provider,
      namespace,
      name,
      host,
      serviceName: name,
      servicePort: 3141,
    });
  }
}
