import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";

import { LonghornPvc, PublicIngressRoute } from "../../utils";

type NpmCacheOptions = {
  provider: KubernetesProvider;
  namespace: string;
  host: string;
  name: string;
};

export class NpmCache extends Construct {
  constructor(scope: Construct, id: string, opts: NpmCacheOptions) {
    super(scope, id);

    const { provider, namespace, name, host } = opts;

    new ConfigMapV1(this, "config", {
      provider,
      metadata: {
        name,
        namespace,
      },
      data: {
        "config.yaml": fs.readFileSync(
          path.join(__dirname, "config.yaml"),
          "utf8",
        ),
      },
    });

    const pvc = new LonghornPvc(this, "pvc", {
      provider,
      namespace,
      name,
      size: "128Gi",
      accessModes: ["ReadWriteMany"],
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
            port: 4873,
            targetPort: name,
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
            nodeSelector: {
              nodepool: "worker",
            },
            topologySpreadConstraint: [
              {
                maxSkew: 1,
                topologyKey: "kubernetes.io/hostname",
                whenUnsatisfiable: "DoNotSchedule",
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
                name: "storage",
                persistentVolumeClaim: {
                  claimName: pvc.name,
                },
              },
              {
                name: "config",
                configMap: {
                  name,
                },
              },
            ],
            container: [
              {
                name,
                image: "verdaccio/verdaccio:latest",
                env: [
                  {
                    name: "VERDACCIO_APP_CONFIG",
                    value: "/verdaccio/conf/custom.yaml",
                  },
                  {
                    name: "VERDACCIO_PORT",
                    value: "4873",
                  },
                ],
                port: [
                  {
                    name,
                    containerPort: 4873,
                  },
                ],
                volumeMount: [
                  {
                    name: "storage",
                    mountPath: "/verdaccio/storage",
                  },
                  {
                    name: "config",
                    mountPath: "/verdaccio/conf/config.yaml",
                    subPath: "config.yaml",
                  },
                ],
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
      servicePort: 4873,
    });
  }
}
