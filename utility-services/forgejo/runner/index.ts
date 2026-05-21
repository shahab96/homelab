import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { PodDisruptionBudgetV1 } from "@cdktf/provider-kubernetes/lib/pod-disruption-budget-v1";

import { OnePasswordSecret, LonghornPvc } from "../../../utils";

type ForgejoRunnerOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  replicas?: number;
  runnerUuid: string;
};

export class ForgejoRunner extends Construct {
  constructor(scope: Construct, id: string, options: ForgejoRunnerOptions) {
    super(scope, id);

    const { provider, name, namespace, runnerUuid } = options;
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
      itemPath: "vaults/Lab/items/forgejo",
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

    new ConfigMapV1(this, "runner-config", {
      provider,
      metadata: {
        name: `${name}-config`,
        namespace,
      },
      data: {
        "config.yml": [
          "log:",
          "  level: info",
          "  job_level: info",
          "runner:",
          '  file: ".runner"',
          "  capacity: 1",
          "  timeout: 1h",
          "  fetch_timeout: 30s",
          "  fetch_interval: 2s",
          "  report_interval: 10s",
          "  labels:",
          "    - docker:docker://node:24-trixie",
          "  report_retry:",
          "    max_retries: 5",
          "    max_delay: 30s",
          "cache:",
          "  enabled: true",
          "  external_server: https://git.dogar.dev/",
          "  secret: TOKEN_PLACEHOLDER",
          "container:",
          "  docker_host: tcp://localhost:2375",
          "  network: host",
          "  options: --tmpfs /var/run:rw,size=1g -v /usr/local/bin/docker:/usr/local/bin/docker -v /var/run/docker.sock:/docker.sock -v /usr/local/libexec/docker/cli-plugins:/usr/local/libexec/docker/cli-plugins -e DOCKER_HOST=tcp://localhost:2375",
          "  workdir_parent: /workspace",
          "  bind_workdir: true",
          "  valid_volumes:",
          "    - /data/act",
          "    - /usr/local/bin/docker",
          "    - /usr/local/libexec/docker/cli-plugins",
          "    - /var/run/docker.sock",
          "host:",
          "  workdir_parent: /data/act",
          "server:",
          "  connections:",
          "    default:",
          "      url: https://git.dogar.dev/",
          `      uuid: ${runnerUuid}`,
          "      token: TOKEN_PLACEHOLDER",
        ].join("\n"),
      },
    });

    new DeploymentV1(this, "forgejo-runner", {
      provider,
      metadata: {
        name: name,
        namespace: namespace,
        labels: {
          app: name,
        },
      },
      spec: {
        strategy: {
          type: "RollingUpdate",
          rollingUpdate: {
            maxSurge: "100%",
            maxUnavailable: "0",
          },
        },
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
            initContainer: [
              {
                name: "runner-init",
                image: "data.forgejo.org/forgejo/runner:12",
                command: ["/bin/bash", "-c"],
                args: [
                  [
                    "set -e",
                    "",
                    "mkdir -p /data/act",
                    'cp /config-in/config.yml /data/config.yml',
                    'sed -i "s|TOKEN_PLACEHOLDER|$${RUNNER_TOKEN}|" /data/config.yml',
                  ].join("\n"),
                ],
                env: [
                  {
                    name: "RUNNER_TOKEN",
                    valueFrom: {
                      secretKeyRef: {
                        name: "runner-secret",
                        key: "runner-token",
                      },
                    },
                  },
                ],
                volumeMount: [
              {
                name: "runner-config",
                    mountPath: "/config-in",
                    readOnly: true,
                  },
                  {
                    name: "runner-data",
                    mountPath: "/data",
                  },
                ],
              },
            ],
            container: [
              {
                name: "runner",
                image: "data.forgejo.org/forgejo/runner:12",
                command: ["forgejo-runner"],
                args: ["daemon", "-c", "/data/config.yml"],
                env: [
                  {
                    name: "DOCKER_HOST",
                    value: "tcp://localhost:2375",
                  },
                ],
                volumeMount: [
                  {
                    name: "runner-data",
                    mountPath: "/data",
                  },
                ],
              },
              {
                name: "dind",
                image: "docker:28.5.2-dind",
                args: ["--host", "tcp://0.0.0.0:2376"],
                env: [
                  {
                    name: "DOCKER_TLS_CERTDIR",
                    value: "",
                  },
                  {
                    name: "DOCKER_DISABLE_CONTAINERD_SNAPSHOTTER",
                    value: "true",
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
              {
                name: "runner-config",
                configMap: {
                  name: `${name}-config`,
                },
              },
            ],
          },
        },
      },
    });
  }
}
