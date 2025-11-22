import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { PersistentVolumeClaimV1 } from "@cdktf/provider-kubernetes/lib/persistent-volume-claim-v1";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";

import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { IngressRoute } from "../../utils";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

export class NixCache extends Construct {
  constructor(scope: Construct, id: string, kubernetes: KubernetesProvider) {
    super(scope, id);

    const pvc = new PersistentVolumeClaimV1(this, "pvc", {
      provider: kubernetes,
      metadata: {
        name: "nix-cache",
        namespace: "homelab",
      },
      spec: {
        storageClassName: "longhorn",
        accessModes: ["ReadWriteMany"],
        resources: {
          requests: {
            storage: "64Gi",
          },
        },
      },
    });

    const nginxConfig = fs.readFileSync(
      path.join(__dirname, "./nginx.conf"),
      "utf-8",
    );

    const configMap = new ConfigMapV1(this, "config-map", {
      provider: kubernetes,
      metadata: {
        name: "nix-cache",
        namespace: "homelab",
      },
      data: {
        "nix-cache.conf": nginxConfig,
      },
    });

    new ServiceV1(this, "service", {
      provider: kubernetes,
      metadata: {
        name: "nix-cache",
        namespace: "homelab",
      },
      spec: {
        selector: {
          app: "nix-cache",
        },
        port: [
          {
            name: "http",
            port: 80,
            targetPort: "80",
          },
        ],
        type: "ClusterIP",
      },
    });

    new DeploymentV1(this, "deployment", {
      provider: kubernetes,
      metadata: {
        name: "nix-cache",
        namespace: "homelab",
      },
      spec: {
        replicas: "3",
        selector: {
          matchLabels: {
            app: "nix-cache",
          },
        },
        template: {
          metadata: {
            labels: {
              app: "nix-cache",
            },
          },
          spec: {
            container: [
              {
                name: "nginx",
                image: "nginx:latest",
                volumeMount: [
                  {
                    name: "cache",
                    mountPath: "/var/cache/nginx/nix",
                  },
                  {
                    name: "nginx-config",
                    mountPath: "/etc/nginx/conf.d/nix-cache.conf",
                    subPath: "nix-cache.conf",
                  },
                ],
              },
            ],
            volume: [
              {
                name: "cache",
                persistentVolumeClaim: {
                  claimName: pvc.metadata.name,
                },
              },
              {
                name: "nginx-config",
                configMap: {
                  name: configMap.metadata.name,
                  items: [
                    {
                      key: "nix-cache.conf",
                      path: "nix-cache.conf",
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });

    new IngressRoute(this, "ingress-route", {
      provider: kubernetes,
      namespace: "homelab",
      host: "nix.dogar.dev",
      serviceName: "nix-cache",
      servicePort: 80,
      entryPoints: ["websecure"],
      tlsSecretName: "nix-cache-tls",
    });
  }
}
