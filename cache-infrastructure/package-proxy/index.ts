import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
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

    new ConfigMapV1(this, "anubis-policy", {
      provider,
      metadata: { name: `${name}-anubis-policy`, namespace },
      data: {
        "botPolicy.yaml": fs.readFileSync(
          path.resolve(__dirname, "botPolicy.yaml"),
          "utf8"
        ),
      },
    });

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
              securityContext: {
                fsGroup: 70,
              },
              restartPolicy: "Never",
              containers: [
                {
                  name: "bootstrap",
                  image: "postgres:18-alpine",
                  command: ["sh", "-c"],
                  args: [
                    `set -e
psql "\$\${PGURL}" -c "DO \\$\\$ BEGIN CREATE ROLE \\"package-proxy\\" WITH LOGIN; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'role exists'; END \\$\\$;"
psql "\$\${PGURL}" -c 'GRANT "package-proxy" TO "shahab";' || true
DB_EXISTS=$(psql "\$\${PGURL}" -Atc "SELECT 1 FROM pg_database WHERE datname = 'package-proxy'")
if [ "$DB_EXISTS" != "1" ]; then
  psql "\$\${PGURL}" -c 'CREATE DATABASE "package-proxy" OWNER "package-proxy";'
fi`,
                  ],
                  env: [
                    {
                      name: "PGURL",
                      value: "postgres://shahab@postgres-cluster-rw.homelab.svc.cluster.local:5432/postgres?sslmode=verify-full&sslrootcert=/etc/postgres/ca.crt&sslcert=/etc/postgres/tls.crt&sslkey=/etc/postgres/tls.key",
                    },
                  ],
                  volumeMounts: [
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
              volumes: [
                {
                  name: "pg-admin-ssl",
                  secret: {
                    secretName: `${name}-admin-pg-ssl-bundle`,
                    defaultMode: 288,
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
            securityContext: {
              fsGroup: "1000",
            },
            nodeSelector: {
              nodepool: "worker",
            },
            volume: [
              {
                name: "anubis-policy",
                configMap: { name: `${name}-anubis-policy` },
              },
              {
                name: "pg-ssl",
                secret: {
                  secretName: `${name}-pg-ssl-bundle`,
                  defaultMode: "0440",
                },
              },
              {
                name: "rustfs-ca",
                configMap: { name: "rustfs-ca" },
              },
            ],
            container: [
              {
                name: "anubis",
                image: "ghcr.io/techarohq/anubis:latest",
                imagePullPolicy: "Always",
                env: [
                  { name: "BIND", value: ":8080" },
                  { name: "DIFFICULTY", value: "4" },
                  {
                    name: "ED25519_PRIVATE_KEY_HEX",
                    valueFrom: {
                      secretKeyRef: {
                        name: "anubis-key",
                        key: "ED25519_PRIVATE_KEY_HEX",
                      },
                    },
                  },
                  { name: "TARGET", value: "http://localhost:3141" },
                  { name: "POLICY_FNAME", value: "/data/cfg/botPolicy.yaml" },
                ],
                resources: {
                  limits: { cpu: "750m", memory: "256Mi" },
                  requests: { cpu: "250m" },
                },
                securityContext: {
                  runAsUser: "1000",
                  runAsGroup: "1000",
                  runAsNonRoot: true,
                  allowPrivilegeEscalation: false,
                  capabilities: { drop: ["ALL"] },
                  seccompProfile: { type: "RuntimeDefault" },
                },
                volumeMount: [
                  {
                    name: "anubis-policy",
                    mountPath: "/data/cfg",
                    readOnly: true,
                  },
                ],
              },
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
            name: "anubis",
            port: 8080,
            targetPort: "8080",
          },
          {
            name: "http",
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
      servicePort: 8080,
    });
  }
}
