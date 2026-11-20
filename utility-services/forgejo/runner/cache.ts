import { createHash } from "crypto";
import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { LonghornPvc } from "../../../utils";

type ForgejoRunnerCacheOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  image: string;
  /** Secret holding the cache secret shared with the runners. */
  secretName: string;
  secretKey: string;
  size: string;
};

/**
 * Standalone `forgejo-runner cache-server` backing `actions/cache` for every
 * runner replica. A single shared instance is required: each runner's
 * internal cache server keeps its index in a single-process bolt.db, so
 * replicas cannot share one directory, and per-replica caches would miss
 * whenever a job lands on a different runner.
 */
export class ForgejoRunnerCache extends Construct {
  /** Cache server URL for the runners' `cache.external_server`. */
  public readonly url: string;

  constructor(scope: Construct, id: string, options: ForgejoRunnerCacheOptions) {
    super(scope, id);

    const { provider, name, namespace, image, secretName, secretKey, size } =
      options;
    const port = 4000;

    // Same namespace as the runners, so the short service name resolves.
    this.url = `http://${name}:${port}/`;

    const pvc = new LonghornPvc(this, "data-pvc", {
      provider,
      name: `${name}-data`,
      namespace,
      size,
    });

    const config = [
      "log:",
      "  level: info",
      "cache:",
      "  enabled: true",
      "  dir: /data/cache",
      `  port: ${port}`,
      `  secret_url: file:/run/secrets/forgejo-runner/${secretKey}`,
    ].join("\n");

    new ConfigMapV1(this, "config", {
      provider,
      metadata: {
        name: `${name}-config`,
        namespace,
      },
      data: {
        "config.yml": config,
      },
    });

    new DeploymentV1(this, "deployment", {
      provider,
      metadata: {
        name,
        namespace,
        labels: {
          app: name,
        },
      },
      spec: {
        replicas: "1",
        strategy: {
          // RWO volume: the old pod must release it before the new one starts.
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
            annotations: {
              "checksum/config": createHash("sha256")
                .update(config)
                .digest("hex"),
            },
          },
          spec: {
            nodeSelector: {
              nodepool: "worker",
            },
            securityContext: {
              fsGroup: "1000",
            },
            container: [
              {
                name: "cache-server",
                image,
                command: ["forgejo-runner"],
                args: ["cache-server", "-c", "/etc/forgejo-runner/config.yml"],
                port: [
                  {
                    name: "http",
                    containerPort: port,
                  },
                ],
                readinessProbe: {
                  tcpSocket: [{ port: port.toString() }],
                  periodSeconds: 10,
                },
                resources: {
                  requests: { cpu: "50m", memory: "64Mi" },
                  limits: { memory: "512Mi" },
                },
                volumeMount: [
                  {
                    name: "config",
                    mountPath: "/etc/forgejo-runner",
                    readOnly: true,
                  },
                  {
                    name: "secrets",
                    mountPath: "/run/secrets/forgejo-runner",
                    readOnly: true,
                  },
                  {
                    name: "data",
                    mountPath: "/data",
                  },
                ],
              },
            ],
            volume: [
              {
                name: "config",
                configMap: {
                  name: `${name}-config`,
                },
              },
              {
                name: "secrets",
                secret: {
                  secretName,
                  items: [{ key: secretKey, path: secretKey }],
                },
              },
              {
                name: "data",
                persistentVolumeClaim: {
                  claimName: pvc.name,
                },
              },
            ],
          },
        },
      },
    });

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
            name: "http",
            port,
            targetPort: port.toString(),
          },
        ],
        type: "ClusterIP",
      },
    });
  }
}
