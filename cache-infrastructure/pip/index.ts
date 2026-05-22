import * as fs from "fs";
import * as path from "path";
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

type PipCacheOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;
  host: string;
};

export class PipCache extends Construct {
  constructor(scope: Construct, id: string, opts: PipCacheOptions) {
    super(scope, id);

    const { provider, namespace, name, host } = opts;

    new OnePasswordSecret(this, "devpi-secret", {
      provider,
      namespace,
      name: "devpi",
      itemPath: "vaults/Lab/items/devpi",
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

    const pvc = new LonghornPvc(this, "pvc", {
      provider,
      namespace,
      name,
      size: "16Gi",
    });

    new DeploymentV1(this, "deployment", {
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
            securityContext: {
              fsGroup: "1000",
            },
            volume: [
              {
                name: "anubis-policy",
                configMap: { name: `${name}-anubis-policy` },
              },
              {
                name: "data",
                persistentVolumeClaim: {
                  claimName: pvc.name,
                },
              },
            ],
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
                  value: "http://localhost:3141"
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
                    drop: ["ALL"],
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
                name,
                image: "jonasal/devpi-server:latest",
                env: [
                  {
                    name: "DEVPI_PASSWORD",
                    valueFrom: {
                      secretKeyRef: {
                        name: "devpi",
                        key: "password",
                      },
                    },
                  },
                ],
                args: [
                  "--request-timeout",
                  "30",
                  "--connection-limit",
                  "1000",
                ],
                port: [
                  {
                    name,
                    containerPort: 3141,
                  },
                ],
                resources: {
                  limits: {
                    cpu: "1",
                    memory: "2Gi"
                  },
                },
                volumeMount: [
                  {
                    name: "data",
                    mountPath: "/devpi",
                  },
                ],
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
            port: 8080,
            targetPort: "8080",
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
