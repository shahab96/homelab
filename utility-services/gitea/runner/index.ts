import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { PodDisruptionBudgetV1 } from "@cdktf/provider-kubernetes/lib/pod-disruption-budget-v1";

import { OnePasswordSecret, LonghornPvc } from "../../../utils";

type GiteaRunnerOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  replicas?: number;
};

export class GiteaRunner extends Construct {
  constructor(scope: Construct, id: string, options: GiteaRunnerOptions) {
    super(scope, id);

    const { provider, name, namespace } = options;
    const replicas = options.replicas?.toString() ?? "1";

    const pvc = new LonghornPvc(this, "data-pvc", {
      provider,
      name: `${name}-data`,
      namespace: namespace,
      size: "10Gi",
      accessModes: ["ReadWriteMany"],
    });

    new OnePasswordSecret(this, "runner-secret", {
      provider,
      name: "runner-secret",
      namespace: namespace,
      itemPath: "vaults/Lab/items/Gitea",
    });

    new PodDisruptionBudgetV1(this, "pdb", {
      provider,
      metadata: {
        name,
        namespace,
      },
      spec: {
        minAvailable: replicas,
        selector: {
          matchLabels: {
            app: name,
          },
        },
      },
    });

    new DeploymentV1(this, "gitea-runner", {
      provider,
      metadata: {
        name: name,
        namespace: namespace,
        labels: {
          app: name,
        },
      },
      spec: {
        replicas,
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
            restartPolicy: "Always",
            securityContext: {
              fsGroup: "1000",
            },
            container: [
              {
                name: "gitea-runner",
                image: "gitea/act_runner:nightly-dind-rootless",
                env: [
                  {
                    name: "DOCKER_HOST",
                    value: "unix:///run/user/1000/docker.sock",
                  },
                  {
                    name: "GITEA_INSTANCE_URL",
                    value: "https://git.dogar.dev",
                  },
                  {
                    name: "GITEA_RUNNER_REGISTRATION_TOKEN",
                    valueFrom: {
                      secretKeyRef: {
                        name: "runner-secret",
                        key: "runner-token",
                      },
                    },
                  },
                ],
                securityContext: {
                  privileged: true,
                },
                volumeMount: [
                  {
                    name: "runner-data",
                    mountPath: "/data",
                  },
                ],
              },
            ],
            volume: [
              {
                name: "runner-data",
                persistentVolumeClaim: {
                  claimName: pvc.name,
                },
              },
            ],
          },
        },
      },
    });
  }
}
