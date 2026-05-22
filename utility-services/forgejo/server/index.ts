import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { PersistentVolumeClaimV1 } from "@cdktf/provider-kubernetes/lib/persistent-volume-claim-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import {
  OnePasswordSecret,
  PublicIngressRoute,
  IngressRouteTcp,
} from "../../../utils";

type ForgejoServerOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
};

export class ForgejoServer extends Construct {
  constructor(scope: Construct, id: string, options: ForgejoServerOptions) {
    super(scope, id);

    const { name, namespace, provider } = options;

    new OnePasswordSecret(this, "forgejo-secrets", {
      provider,
      name: "forgejo",
      namespace,
      itemPath: "vaults/Lab/items/forgejo",
    });

    new ConfigMapV1(this, "global-config", {
      provider,
      metadata: { name: `${name}-global-config`, namespace },
      data: {
        FORGEJO__APP_NAME: "Forgejo: Beyond coding. We forge.",
        FORGEJO__RUN_MODE: "prod",
      },
    });

    new ConfigMapV1(this, "git-config", {
      provider,
      metadata: { name: `${name}-git-config`, namespace },
      data: {
        FORGEJO__git_0X2E_timeout__MIGRATE: "86400",
      },
    });

    new ConfigMapV1(this, "security-config", {
      provider,
      metadata: { name: `${name}-security-config`, namespace },
      data: {
        FORGEJO__security__INSTALL_LOCK: "true",
        FORGEJO__security__GLOBAL_TWO_FACTOR_REQUIREMENT: "all",
      },
    });

    new ConfigMapV1(this, "cors-config", {
      provider,
      metadata: { name: `${name}-cors-config`, namespace },
      data: {
        FORGEJO__cors__ENABLED: "true",
        FORGEJO__cors__ALLOW_DOMAIN: "https://git.dogar.dev",
      },
    });

    new ConfigMapV1(this, "repository-config", {
      provider,
      metadata: { name: `${name}-repository-config`, namespace },
      data: {
        FORGEJO__repository__ENABLE_PUSH_CREATE_USER: "true",
        FORGEJO__repository__ENABLE_PUSH_CREATE_ORG: "true",
      },
    });

    new ConfigMapV1(this, "server-config", {
      provider,
      metadata: { name: `${name}-server-config`, namespace },
      data: {
        FORGEJO__server__PROTOCOL: "http",
        FORGEJO__server__ROOT_URL: "https://git.dogar.dev/",
        FORGEJO__server__SSH_DOMAIN: "git.dogar.dev",
        FORGEJO__server__DOMAIN: "git.dogar.dev",
        FORGEJO__server__DISABLE_SSH: "false",
        FORGEJO__server__SSH_LISTEN_PORT: "2222",
        FORGEJO__server__SSH_PORT: "2222",
        FORGEJO__server__SSL_MIN_VERSION: "TLSv1.3",
        FORGEJO__server__LFS_START_SERVER: "true",
        FORGEJO__server__ENABLE_PPROF: "false",
        FORGEJO__server__ENABLE_GZIP: "true",
        FORGEJO__server__HTTP_PORT: "3000",
      },
    });

    new ConfigMapV1(this, "database-config", {
      provider,
      metadata: { name: `${name}-database-config`, namespace },
      data: {
        FORGEJO__database__DB_TYPE: "postgres",
        FORGEJO__database__HOST: "postgres-cluster-rw:5432",
        FORGEJO__database__NAME: "forgejo",
        FORGEJO__database__USER: "forgejo",
        FORGEJO__database__SSL_MODE: "verify-full",
      },
    });

    new ConfigMapV1(this, "cache-config", {
      provider,
      metadata: { name: `${name}-cache-config`, namespace },
      data: {
        FORGEJO__cache__ADAPTER: "memory",
      },
    });

    new ConfigMapV1(this, "session-config", {
      provider,
      metadata: { name: `${name}-session-config`, namespace },
      data: {
        FORGEJO__session__PROVIDER: "db",
      },
    });

    new ConfigMapV1(this, "queue-config", {
      provider,
      metadata: { name: `${name}-queue-config`, namespace },
      data: {
        FORGEJO__queue__TYPE: "channel",
      },
    });

    new ConfigMapV1(this, "storage-config", {
      provider,
      metadata: { name: `${name}-storage-config`, namespace },
      data: {
        FORGEJO__storage__STORAGE_TYPE: "minio",
        FORGEJO__storage__MINIO_USE_SSL: "true",
        FORGEJO__storage__MINIO_BUCKET: "forgejo",
        FORGEJO__storage__MINIO_ENDPOINT: "blob.dogar.dev:443",
      },
    });

    new ConfigMapV1(this, "service-config", {
      provider,
      metadata: { name: `${name}-service-config`, namespace },
      data: {
        FORGEJO__service__DISABLE_REGISTRATION: "true",
      },
    });

    new ConfigMapV1(this, "indexer-config", {
      provider,
      metadata: { name: `${name}-indexer-config`, namespace },
      data: {
        FORGEJO__indexer__ISSUE_INDEXER_TYPE: "db",
      },
    });

    new ConfigMapV1(this, "oauth2-client-config", {
      provider,
      metadata: { name: `${name}-oauth2-client-config`, namespace },
      data: {
        FORGEJO__oauth2_client__ENABLE_AUTO_REGISTRATION: "true",
        FORGEJO__oauth2_client__UPDATE_AVATAR: "true",
      },
    });

    new ConfigMapV1(this, "openid-config", {
      provider,
      metadata: { name: `${name}-openid-config`, namespace },
      data: {
        FORGEJO__openid__ENABLE_OPENID_SIGNIN: "false",
      },
    });

    new ConfigMapV1(this, "mailer-config", {
      provider,
      metadata: { name: `${name}-mailer-config`, namespace },
      data: {
        FORGEJO__mailer__ENABLED: "true",
        FORGEJO__mailer__PROTOCOL: "smtp+starttls",
        FORGEJO__mailer__SMTP_ADDR: "smtp.protonmail.ch",
        FORGEJO__mailer__SMTP_PORT: "587",
        FORGEJO__mailer__FROM: "git@dogar.dev",
        FORGEJO__mailer__USER: "git@dogar.dev",
      },
    });

    new ConfigMapV1(this, "picture-config", {
      provider,
      metadata: { name: `${name}-picture-config`, namespace },
      data: {
        FORGEJO__picture__GRAVATAR_SOURCE: "gravatar",
        FORGEJO__picture__ENABLE_FEDERATED_AVATAR: "true",
      },
    });

    new ConfigMapV1(this, "metrics-config", {
      provider,
      metadata: { name: `${name}-metrics-config`, namespace },
      data: {
        FORGEJO__metrics__ENABLED: "true",
      },
    });

    new ConfigMapV1(this, "actions-config", {
      provider,
      metadata: { name: `${name}-actions-config`, namespace },
      data: {
        FORGEJO__actions__ENABLED: "true",
        FORGEJO__actions__DEFAULT_ACTIONS_URL: "https://code.forgejo.org",
      },
    });

    new ConfigMapV1(this, "log-config", {
      provider,
      metadata: { name: `${name}-log-config`, namespace },
      data: {
        FORGEJO__log__LEVEL: "info",
        FORGEJO__log__MODE: "console",
      },
    });

    new ConfigMapV1(this, "pg-config", {
      provider,
      metadata: { name: `${name}-pg-config`, namespace },
      data: {
        PGSSLMODE: "verify-full",
        PGSSLROOTCERT: "/opt/forgejo/.postgresql/root.crt",
        PGSSLCERT: "/opt/forgejo/.postgresql/postgresql.crt",
        PGSSLKEY: "/opt/forgejo/.postgresql/postgresql.key",
      },
    });

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

    new PersistentVolumeClaimV1(this, "data", {
      provider,
      metadata: {
        name: `${name}-data`,
        namespace,
        labels: {
          "recurring-job.longhorn.io/source": "enabled",
          "recurring-job.longhorn.io/daily-backup": "enabled",
        },
      },
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: { requests: { storage: "10Gi" } },
        storageClassName: "longhorn",
      },
    });

    new ServiceV1(this, "http-service", {
      provider,
      metadata: { name, namespace },
      spec: {
        selector: { app: name },
        port: [
          {
            name: "anubis",
            port: 8080,
            targetPort: "8080",
          },
          {
            name: "http",
            port: 3000,
            targetPort: "3000",
          },
          {
            name: "ssh",
            port: 2222,
            targetPort: "2222",
          },
        ],
        type: "ClusterIP",
      },
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
            nodeSelector: { nodepool: "worker" },
            securityContext: { fsGroup: "1000" },
            container: [
              {
                name: "anubis",
                image: "ghcr.io/techarohq/anubis:latest",
                imagePullPolicy: "Always",
                env: [{
                  name: "BIND",
                  value: ":8080"
                }, {
                  name: "DIFFICULTY",
                  value: "4"
                }, {
                  name: "ED25519_PRIVATE_KEY_HEX",
                  valueFrom: {
                    secretKeyRef: {
                      name: "anubis-key",
                      key: "ED25519_PRIVATE_KEY_HEX"
                    },
                  },
                }, {
                  name: "TARGET",
                  value: "http://localhost:3000"
                }, {
                  name: "OG_PASSTHROUGH",
                  value: "true"
                }, {
                  name: "OG_EXPIRY_TIME",
                  value: "24h"
                }, {
                  name: "POLICY_FNAME",
                  value: "/data/cfg/botPolicy.yaml"
                }],
                resources: {
                  limits: {
                    cpu: "750m",
                    memory: "256Mi"
                  },
                  requests: {
                    cpu: "250m",
                  },
                },
                securityContext: {
                  runAsUser: "1000",
                  runAsGroup: "1000",
                  runAsNonRoot: true,
                  allowPrivilegeEscalation: false,
                  capabilities: {
                    drop: [
                      "ALL",
                    ],
                  },
                  seccompProfile: {
                    type: "RuntimeDefault",
                  },
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
                name: "forgejo",
                image: "codeberg.org/forgejo/forgejo:15-rootless",
                envFrom: [
                  { configMapRef: { name: `${name}-global-config` } },
                  { configMapRef: { name: `${name}-git-config` } },
                  { configMapRef: { name: `${name}-security-config` } },
                  { configMapRef: { name: `${name}-cors-config` } },
                  { configMapRef: { name: `${name}-repository-config` } },
                  { configMapRef: { name: `${name}-server-config` } },
                  { configMapRef: { name: `${name}-database-config` } },
                  { configMapRef: { name: `${name}-cache-config` } },
                  { configMapRef: { name: `${name}-session-config` } },
                  { configMapRef: { name: `${name}-queue-config` } },
                  { configMapRef: { name: `${name}-storage-config` } },
                  { configMapRef: { name: `${name}-service-config` } },
                  { configMapRef: { name: `${name}-indexer-config` } },
                  { configMapRef: { name: `${name}-oauth2-client-config` } },
                  { configMapRef: { name: `${name}-openid-config` } },
                  { configMapRef: { name: `${name}-mailer-config` } },
                  { configMapRef: { name: `${name}-picture-config` } },
                  { configMapRef: { name: `${name}-metrics-config` } },
                  { configMapRef: { name: `${name}-actions-config` } },
                  { configMapRef: { name: `${name}-log-config` } },
                  { configMapRef: { name: `${name}-pg-config` } },
                  { secretRef: { name: "forgejo" } },
                ],
                port: [
                  { name: "http", containerPort: 3000 },
                  { name: "ssh", containerPort: 2222 },
                ],
                volumeMount: [
                  {
                    name: "data",
                    mountPath: "/var/lib/gitea",
                  },
                  {
                    name: "ssl-bundle",
                    mountPath: "/opt/forgejo/.postgresql",
                    readOnly: true,
                  },
                  {
                    name: "temp",
                    mountPath: "/tmp/forgejo-uploads",
                  },
                ],
                resources: {
                  requests: { cpu: "1", memory: "128Mi" },
                  limits: { cpu: "6", memory: "6Gi" },
                },
                livenessProbe: {
                  httpGet: {
                    path: "/api/healthz",
                    port: "3000",
                    scheme: "HTTP",
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                },
                readinessProbe: {
                  httpGet: {
                    path: "/api/healthz",
                    port: "3000",
                    scheme: "HTTP",
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                },
                startupProbe: {
                  httpGet: {
                    path: "/api/healthz",
                    port: "3000",
                    scheme: "HTTP",
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                  failureThreshold: 30,
                },
              },
            ],
            volume: [
              {
                name: "data",
                persistentVolumeClaim: { claimName: `${name}-data` },
              },
              {
                name: "ssl-bundle",
                projected: [
                  {
                    sources: [
                      {
                        secret: [
                          {
                            name: "forgejo-client-cert",
                            items: [
                              { key: "tls.crt", path: "postgresql.crt" },
                              {
                                key: "tls.key",
                                path: "postgresql.key",
                                mode: "0600",
                              },
                            ],
                          },
                        ],
                      },
                      {
                        secret: [
                          {
                            name: "postgres-server-cert",
                            items: [{ key: "ca.crt", path: "root.crt" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                name: "anubis-policy",
                configMap: { name: `${name}-anubis-policy` },
              },
              { name: "temp", emptyDir: {} },
            ],
          },
        },
      },
    });

    new IngressRouteTcp(this, "ssh-ingress", {
      provider,
      namespace,
      name,
      match: "HostSNI(`*`)",
      entryPoint: "ssh",
      serviceName: name,
      servicePort: 2222,
    });

    new PublicIngressRoute(this, "http-ingress", {
      provider,
      namespace,
      name,
      host: "git.dogar.dev",
      serviceName: name,
      servicePort: 8080,
      serviceProtocol: "http",
    });
  }
}
