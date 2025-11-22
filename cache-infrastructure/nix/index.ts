import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { PublicIngressRoute, LonghornPvc } from "../../utils";

type NixCacheOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  host: string;
};

export class NixCache extends Construct {
  constructor(scope: Construct, id: string, options: NixCacheOptions) {
    super(scope, id);

    const { provider, name, namespace, host } = options;

    const pvc = new LonghornPvc(this, "pvc", {
      provider,
      name,
      namespace,
      accessModes: ["ReadWriteMany"],
      size: "64Gi",
    });

    const nginxConfig = fs.readFileSync(
      path.join(__dirname, "./nginx.conf"),
      "utf-8",
    );

    new ConfigMapV1(this, "config", {
      provider,
      metadata: {
        name,
        namespace,
      },
      data: {
        "nix-cache.conf": nginxConfig,
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
        name,
        namespace,
      },
      spec: {
        replicas: "3",
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
                  name,
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
      name,
      namespace,
      host,
      serviceName: name,
      servicePort: 80,
    });
  }
}
