import { Construct } from "constructs";
import {
  StatefulSetV1,
  StatefulSetV1SpecTemplateSpecContainerEnv,
} from "@cdktf/provider-kubernetes/lib/stateful-set-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { IngressRouteTcp } from "../../../utils";

export type MinecraftServerOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;
  env: StatefulSetV1SpecTemplateSpecContainerEnv[];
  image: string;
  size?: string;
};

export class MinecraftServer extends Construct {
  constructor(scope: Construct, id: string, opts: MinecraftServerOptions) {
    super(scope, id);

    const { provider, namespace, name, image, env, size = "10Gi" } = opts;

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
            port: 25565,
            targetPort: name,
          },
        ],
        type: "ClusterIP",
      },
    });

    new StatefulSetV1(this, "stateful-set", {
      provider,
      metadata: {
        name,
        namespace,
      },
      waitForRollout: false,
      spec: {
        replicas: "1",
        serviceName: name,
        updateStrategy: [
          {
            type: "OnDelete",
          },
        ],
        selector: {
          matchLabels: {
            app: name,
          },
        },
        persistentVolumeClaimRetentionPolicy: [
          {
            whenDeleted: "Retain",
            whenScaled: "Retain",
          },
        ],
        volumeClaimTemplate: [
          {
            metadata: {
              name: `${name}-data`,
            },
            spec: {
              accessModes: ["ReadWriteOnce"],
              resources: {
                requests: {
                  storage: size,
                },
              },
              storageClassName: "longhorn",
            },
          },
        ],
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
            volume: [
              {
                name: `${name}-data`,
                persistentVolumeClaim: {
                  claimName: `${name}-data-${name}-0`,
                },
              },
            ],
            container: [
              {
                name,
                image,
                env,
                port: [
                  {
                    name: "minecraft",
                    containerPort: 25565,
                  },
                ],
                volumeMount: [
                  {
                    name: `${name}-data`,
                    mountPath: "/data",
                  },
                ],
                resources: {
                  requests: {
                    cpu: "2",
                    memory: "4Gi",
                  },
                  limits: {
                    cpu: "6",
                    memory: "12Gi",
                  },
                },
              },
            ],
          },
        },
      },
    });

    new IngressRouteTcp(this, "ingress", {
      provider,
      namespace,
      name,
      serviceName: name,
      servicePort: 25565,
      entryPoint: `minecraft-${name}`,
      match: "HostSNI(`*`)",
    });
  }
}
