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

    const appIni = fs
      .readFileSync(path.join(__dirname, "app.ini"), "utf8");

    new ConfigMapV1(this, "config", {
      provider,
      metadata: { name: `${name}-config`, namespace },
      data: { "app.ini": appIni },
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
      metadata: { name: `${name}-http`, namespace },
      spec: {
        selector: { app: name },
        port: [{ name: "http", port: 3000, targetPort: "3000" }],
        type: "ClusterIP",
      },
    });

    new ServiceV1(this, "ssh-service", {
      provider,
      metadata: { name: `${name}-ssh`, namespace },
      spec: {
        selector: { app: name },
        port: [{ name: "ssh", port: 2222, targetPort: "2222" }],
        type: "ClusterIP",
      },
    });

    new DeploymentV1(this, "deployment", {
      provider,
      metadata: { name, namespace, labels: { app: name } },
      spec: {
        replicas: "1",
        selector: { matchLabels: { app: name } },
        template: {
          metadata: { labels: { app: name } },
          spec: {
            nodeSelector: { nodepool: "worker" },
            securityContext: { fsGroup: "1000" },
            initContainer: [
              {
                name: "forgejo-setup",
                image: "codeberg.org/forgejo/forgejo:15-rootless",
                envFrom: [
                  { configMapRef: { name: `${name}-pg-config` } },
                  { secretRef: { name: 'forgejo' } },
                ],
                volumeMount: [
                  {
                    name: "data",
                    mountPath: "/var/lib/gitea",
                  },
                  {
                    name: "config",
                    mountPath: "/etc/gitea/app.ini",
                    subPath: "app.ini",
                  },
                  {
                    name: "ssl-bundle",
                    mountPath: "/opt/forgejo/.postgresql",
                    readOnly: true,
                  },
                ],
                command: [
                  "/bin/sh",
                  "-c",
                  [
                    'mkdir -p /var/lib/gitea/custom/conf',
                    '&&',
                    'test -f /var/lib/gitea/custom/conf/app.ini || cp /etc/gitea/app.ini /var/lib/gitea/custom/conf/app.ini',
                    '&&',
                    'forgejo admin user create --admin',
                    '--username "$FORGEJO_ADMIN_USER"',
                    '--password "$FORGEJO_ADMIN_PASSWORD"',
                    '--email "$FORGEJO_ADMIN_EMAIL"',
                    '--config /var/lib/gitea/custom/conf/app.ini',
                    "2>/dev/null || true",
                    '&&',
                    'forgejo admin auth add-oauth',
                    '--name authentik',
                    '--provider openidConnect',
                    '--key "$FORGEJO_OAUTH_KEY"',
                    '--secret "$FORGEJO_OAUTH_SECRET"',
                    '--auto-discover-url',
                    '"https://auth.dogar.dev/application/o/forgejo/.well-known/openid-configuration"',
                    '--config /var/lib/gitea/custom/conf/app.ini',
                    "2>/dev/null || true",
                  ].join(" "),
                ],
              },
            ],
            container: [
              {
                name: "forgejo",
                image: "codeberg.org/forgejo/forgejo:15-rootless",
                envFrom: [
                  { configMapRef: { name: `${name}-pg-config` } },
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
                    name: "config",
                    mountPath: "/etc/gitea/app.ini",
                    subPath: "app.ini",
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
                  requests: { cpu: "100m", memory: "128Mi" },
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
                name: "config",
                configMap: { name: `${name}-config` },
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
      serviceName: `${name}-ssh`,
      servicePort: 2222,
    });

    new PublicIngressRoute(this, "http-ingress", {
      provider,
      namespace,
      name,
      host: "git.dogar.dev",
      serviceName: `${name}-http`,
      servicePort: 3000,
      serviceProtocol: "http",
    });
  }
}
