import { Construct } from "constructs";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import {
  LonghornPvc,
  OnePasswordSecret,
  PublicIngressRoute,
} from "../../utils";
import { ServiceAccountV1 } from "@cdktf/provider-kubernetes/lib/service-account-v1";
import { ClusterRoleBindingV1 } from "@cdktf/provider-kubernetes/lib/cluster-role-binding-v1";
import { SecretV1 } from "@cdktf/provider-kubernetes/lib/secret-v1";

type PaperclipOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  host: string;
};

export class Paperclip extends Construct {
  constructor(scope: Construct, id: string, options: PaperclipOptions) {
    super(scope, id);

    const { name, namespace, provider, host } = options;

    // 1Password item with fields:
    //   BETTER_AUTH_SECRET
    //   PAPERCLIP_TOOL_ACTION_SIGNING_SECRET
    new OnePasswordSecret(this, "app-secrets", {
      provider,
      name,
      namespace,
      itemPath: "vaults/Lab/items/paperclip",
    });

    new ConfigMapV1(this, "config", {
      provider,
      metadata: { name: `${name}-config`, namespace },
      data: {
        // Server core
        HOST: "0.0.0.0",
        PORT: "3100",
        SERVE_UI: "true",
        PAPERCLIP_HOME: "/paperclip",

        // Auth (better-auth, first sign-up becomes instance admin)
        PAPERCLIP_DEPLOYMENT_MODE: "authenticated",
        PAPERCLIP_DEPLOYMENT_EXPOSURE: "public",
        PAPERCLIP_PUBLIC_URL: `https://${host}`,
        PAPERCLIP_ALLOWED_HOSTNAMES: host,
        PAPERCLIP_AUTH_DISABLE_SIGN_UP: "false",

        // Database (existing CNPG cluster, client-cert auth)
        // Database (existing CNPG cluster; password comes from PGPASSWORD secret env)
        DATABASE_URL:
          "postgres://paperclip@postgres-cluster-rw.homelab.svc.cluster.local:5432/paperclip?sslmode=verify-full",
        PAPERCLIP_MIGRATION_AUTO_APPLY: "true",
        PAPERCLIP_DB_BACKUP_ENABLED: "false", // CNPG already backs up to R2

        // Object storage (RustFS tenant, S3 API over TLS)
        PAPERCLIP_STORAGE_PROVIDER: "s3",
        PAPERCLIP_STORAGE_S3_BUCKET: "paperclip",
        PAPERCLIP_STORAGE_S3_ENDPOINT: "https://blob.dogar.dev",
        PAPERCLIP_STORAGE_S3_REGION: "us-east-1",
        PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE: "true",

        // Trust the homelab internal CA for the Postgres TLS certificate
        NODE_EXTRA_CA_CERTS: "/etc/paperclip/postgres/ca.crt",
      },
    });

    new ConfigMapV1(this, "npmrc", {
      provider,
      metadata: { name: `${name}-npmrc`, namespace },
      data: {
        ".npmrc": [
          "engine-strict=true",
          "audit=false",
          "registry=https://pkgs.dogar.dev/npm/",
          "install-links=false",
        ].join("\n"),
      },
    });

    new LonghornPvc(this, "data", {
      provider,
      backup: true,
      name: `${name}-data`,
      namespace,
      size: "50Gi",
    });

    new ServiceV1(this, "service", {
      provider,
      metadata: { name, namespace },
      spec: {
        selector: { app: name },
        port: [
          {
            name: "http",
            port: 3100,
            targetPort: "3100",
          },
        ],
        type: "ClusterIP",
      },
    });

    const sa = new ServiceAccountV1(this, "service-account", {
      metadata: {
        name: `${name}-readonly`,
        namespace,
      }
    });

    new ClusterRoleBindingV1(this, "cluster-role-binding", {
      metadata: {
        name: `${name}-readonly-view`,
      },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
        name: "view",
      },
      subject: [{
        kind: "ServiceAccount",
        name: sa.metadata.name,
        namespace,
      }],
    });

    new SecretV1(this, "sa-secret", {
      metadata: {
        name: `${sa.metadata.name}-token`,
        namespace,
        annotations: {
          "kubernetes.io/service-account.name": sa.metadata.name,
        },
      },
      type: "kubernetes.io/service-account-token",
    });

    new DeploymentV1(this, "deployment", {
      provider,
      metadata: { name, namespace, labels: { app: name } },
      spec: {
        replicas: "1",
        strategy: {
          type: "Recreate",
        },
        selector: { matchLabels: { app: name } },
        template: {
          metadata: { labels: { app: name } },
          spec: {
            serviceAccountName: sa.metadata.name,
            nodeSelector: { nodepool: "worker" },
            securityContext: { fsGroup: "1000" },
            container: [
              {
                name,
                image: "ghcr.io/paperclipai/paperclip:latest",
                imagePullPolicy: "IfNotPresent",
                envFrom: [
                  { configMapRef: { name: `${name}-config` } },
                  { secretRef: { name } },
                ],
                env: [
                  {
                    name: "PGPASSWORD",
                    valueFrom: {
                      secretKeyRef: {
                        name,
                        key: "password",
                      },
                    },
                  },
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
                ],
                port: [{ name: "http", containerPort: 3100 }],
                volumeMount: [
                  {
                    name: "data",
                    mountPath: "/paperclip",
                  },
                  {
                    name: "npmrc",
                    mountPath: "/paperclip/.npmrc",
                    subPath: ".npmrc",
                    readOnly: true,
                  },
                  {
                    name: "postgres-ca",
                    mountPath: "/etc/paperclip/postgres",
                    readOnly: true,
                  },
                ],
                resources: {
                  requests: { cpu: "500m", memory: "1Gi" },
                  limits: { cpu: "2", memory: "4Gi" },
                },
                securityContext: {
                  runAsUser: "1000",
                  runAsGroup: "1000",
                  runAsNonRoot: true,
                  allowPrivilegeEscalation: false,
                  capabilities: {
                    drop: ["ALL"],
                  },
                  seccompProfile: {
                    type: "RuntimeDefault",
                  },
                },
                livenessProbe: {
                  httpGet: {
                    path: "/api/health",
                    port: "3100",
                    scheme: "HTTP",
                  },
                  initialDelaySeconds: 15,
                  periodSeconds: 20,
                },
                readinessProbe: {
                  httpGet: {
                    path: "/api/health",
                    port: "3100",
                    scheme: "HTTP",
                  },
                  initialDelaySeconds: 15,
                  periodSeconds: 10,
                },
                startupProbe: {
                  httpGet: {
                    path: "/api/health",
                    port: "3100",
                    scheme: "HTTP",
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 10,
                  failureThreshold: 36, // migrations run in-process on boot
                },
              },
            ],
            volume: [
              {
                name: "data",
                persistentVolumeClaim: { claimName: `${name}-data` },
              },
              {
                name: "npmrc",
                configMap: { name: `${name}-npmrc` },
              },
              {
                name: "postgres-ca",
                secret: {
                  secretName: "postgres-server-cert",
                  items: [{ key: "ca.crt", path: "ca.crt" }],
                },
              },
            ],
          },
        },
      },
    });

    new PublicIngressRoute(this, "ingress", {
      provider,
      namespace,
      name,
      host,
      serviceName: name,
      servicePort: 3100,
      serviceProtocol: "http",
    });
  }
}
