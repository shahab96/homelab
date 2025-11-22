import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

import { OnePasswordSecret } from "../../utils";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";

type DynamicDNSOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  records: string[];
};

export class DynamicDNS extends Construct {
  constructor(scope: Construct, id: string, options: DynamicDNSOptions) {
    super(scope, id);

    const { provider, name, namespace, records } = options;

    new OnePasswordSecret(this, "cloudflare-token", {
      provider,
      name: "ddns-cloudflare-token",
      namespace: options.namespace,
      itemPath: "vaults/Lab/items/cloudflare",
    });

    new ConfigMapV1(this, "ddns-configmap", {
      provider,
      metadata: {
        name,
        namespace,
      },
      data: {
        DOMAINS: records.join(","),
        PROXIED: "false",
      },
    });

    new DeploymentV1(this, "ddns-deployment", {
      provider,
      metadata: {
        name,
        namespace,
      },
      spec: {
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
            container: [
              {
                name: "ddns-updater",
                image: "favonia/cloudflare-ddns:latest",
                env: [
                  {
                    name: "CLOUDFLARE_API_TOKEN",
                    valueFrom: {
                      secretKeyRef: {
                        name: "ddns-cloudflare-token",
                        key: "token",
                      },
                    },
                  },
                  {
                    name: "DOMAINS",
                    valueFrom: {
                      configMapKeyRef: {
                        name,
                        key: "DOMAINS",
                      },
                    },
                  },
                  {
                    name: "PROXIED",
                    valueFrom: {
                      configMapKeyRef: {
                        name,
                        key: "PROXIED",
                      },
                    },
                  },
                  {
                    name: "UPDATE_TIMEOUT",
                    value: "30s",
                  },
                  {
                    name: "IP6_PROVIDER",
                    value: "none",
                  },
                ],
              },
            ],
          },
        },
      },
    });
  }
}
