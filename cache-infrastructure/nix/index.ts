import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { PublicIngressRoute, LonghornPvc } from "../../utils";

export class NixCache extends Construct {
  constructor(scope: Construct, id: string, provider: KubernetesProvider) {
    super(scope, id);

    const pvc = new LonghornPvc(this, "pvc", {
      provider,
      name: "nix-cache",
      namespace: "homelab",
      accessModes: ["ReadWriteMany"],
      size: "64Gi",
    });

    const nginxConfig = fs.readFileSync(
      path.join(__dirname, "./nginx.conf"),
      "utf-8",
    );

    const configMap = new ConfigMapV1(this, "config-map", {
      provider,
      metadata: {
        name: "nix-cache",
        namespace: "homelab",
      },
      data: {
        "nix-cache.conf": nginxConfig,
      },
    });

    new ServiceV1(this, "service", {
      provider,
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
      provider,
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
                  claimName: pvc.name,
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

    new PublicIngressRoute(this, "ingress-route", {
      provider,
      name: "nix-cache",
      namespace: "homelab",
      host: "nix.dogar.dev",
      serviceName: "nix-cache",
      servicePort: 80,
    });
  }
}
