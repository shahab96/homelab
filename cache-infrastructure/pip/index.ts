import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
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

    const pvc = new LonghornPvc(this, "pvc", {
      provider,
      namespace,
      name,
      size: "128Gi",
      accessModes: ["ReadWriteMany"],
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
            nodeSelector: {
              nodepool: "worker",
            },
            topologySpreadConstraint: [
              {
                maxSkew: 1,
                topologyKey: "kubernetes.io/hostname",
                whenUnsatisfiable: "ScheduleAnyway",
                labelSelector: [
                  {
                    matchLabels: {
                      app: name,
                    },
                  },
                ],
              },
            ],
            affinity: {
              podAntiAffinity: {
                requiredDuringSchedulingIgnoredDuringExecution: [
                  {
                    topologyKey: "kubernetes.io/hostname",
                    labelSelector: [
                      {
                        matchExpressions: [
                          {
                            key: "app",
                            operator: "In",
                            values: [name],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
            volume: [
              {
                name: "data",
                persistentVolumeClaim: {
                  claimName: pvc.name,
                },
              },
            ],
            container: [
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
                port: [
                  {
                    name,
                    containerPort: 3141,
                  },
                ],
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
            port: 3141,
            targetPort: name,
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
      servicePort: 3141,
    });
  }
}
