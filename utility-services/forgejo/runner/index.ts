import { createHash } from "crypto";
import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { PodDisruptionBudgetV1 } from "@cdktf/provider-kubernetes/lib/pod-disruption-budget-v1";

import { OnePasswordSecret } from "../../../utils";
import { ForgejoRunnerCache } from "./cache";

const RUNNER_IMAGE = "data.forgejo.org/forgejo/runner:12";
const DIND_IMAGE = "docker:28.5.2-dind";

// dind only listens on loopback: the runner and its host-network job
// containers share the pod's network namespace, so nothing else needs it.
const DOCKER_HOST = "tcp://127.0.0.1:2375";

// Prune dind's storage once it grows past this and no job is running.
const DOCKER_GC_THRESHOLD_MIB = 20 * 1024;

const SECRET_NAME = "runner-secret";
const RUNNER_TOKEN_KEY = "runner-token";
const CACHE_SECRET_KEY = "cache-secret";
const SECRETS_DIR = "/run/secrets/forgejo-runner";

type ForgejoRunnerOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  /** Runner pods, scheduled at most one per node. */
  replicas?: number;
  runnerUuid: string;
  registryMirror?: string;
  /** Size of the shared actions/cache volume. */
  cacheSize?: string;
};

export class ForgejoRunner extends Construct {
  constructor(scope: Construct, id: string, options: ForgejoRunnerOptions) {
    super(scope, id);

    const { provider, name, namespace, runnerUuid } = options;
    const replicas = options.replicas?.toString() ?? "1";

    // Passing `dockerd` explicitly bypasses the dind entrypoint's defaults,
    // which would add a unix socket and a second, unauthenticated
    // tcp://0.0.0.0:2375 listener (plus a deliberate ~15s startup delay).
    const dindArgs = ["dockerd", `--host=${DOCKER_HOST}`];
    if (options.registryMirror) {
      dindArgs.push(`--registry-mirror=${options.registryMirror}`);
    }

    new OnePasswordSecret(this, "runner-secret", {
      provider,
      name: SECRET_NAME,
      namespace: namespace,
      itemPath: "vaults/Lab/items/forgejo",
    });

    const cache = new ForgejoRunnerCache(this, "cache", {
      provider,
      name: `${name}-cache`,
      namespace,
      image: RUNNER_IMAGE,
      secretName: SECRET_NAME,
      secretKey: CACHE_SECRET_KEY,
      size: options.cacheSize ?? "20Gi",
    });

    new PodDisruptionBudgetV1(this, "pdb", {
      provider,
      metadata: {
        name,
        namespace,
      },
      spec: {
        maxUnavailable: "1",
        selector: {
          matchLabels: {
            app: name,
          },
        },
      },
    });

    const config = [
      "log:",
      "  level: info",
      "  job_level: info",
      "runner:",
      "  capacity: 1",
      "  timeout: 1h",
      "  fetch_timeout: 30s",
      "  fetch_interval: 2s",
      "  report_interval: 10s",
      "  labels:",
      "    - docker:docker://node:24-trixie",
      "    - ubuntu-latest:docker://catthehacker/ubuntu:act-24.04",
      "  report_retry:",
      "    max_retries: 5",
      "    max_delay: 30s",
      "cache:",
      "  enabled: true",
      `  external_server: ${cache.url}`,
      `  secret_url: file:${SECRETS_DIR}/${CACHE_SECRET_KEY}`,
      "container:",
      `  docker_host: ${DOCKER_HOST}`,
      "  network: host",
      `  options: --tmpfs /var/run:rw,size=1g -v /usr/local/bin/docker:/usr/local/bin/docker -v /usr/local/libexec/docker/cli-plugins:/usr/local/libexec/docker/cli-plugins -e DOCKER_HOST=${DOCKER_HOST}`,
      "  valid_volumes:",
      "    - /usr/local/bin/docker",
      "    - /usr/local/libexec/docker/cli-plugins",
      "server:",
      "  connections:",
      "    default:",
      "      url: http://forgejo.homelab.svc.cluster.local:3000/",
      `      uuid: ${runnerUuid}`,
      `      token_url: file:${SECRETS_DIR}/${RUNNER_TOKEN_KEY}`,
    ].join("\n");

    new ConfigMapV1(this, "runner-config", {
      provider,
      metadata: {
        name: `${name}-config`,
        namespace,
      },
      data: {
        "config.yml": config,
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
          // Anti-affinity leaves no free node for a surge pod, so replace
          // runners one at a time instead.
          type: "RollingUpdate",
          rollingUpdate: {
            maxSurge: "0",
            maxUnavailable: "1",
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
            annotations: {
              // The runner only reads its config at startup.
              "checksum/config": createHash("sha256")
                .update(config)
                .digest("hex"),
            },
          },
          spec: {
            nodeSelector: {
              nodepool: "worker",
            },
            affinity: {
              podAntiAffinity: {
                requiredDuringSchedulingIgnoredDuringExecution: [
                  {
                    labelSelector: [
                      {
                        matchLabels: {
                          app: name,
                        },
                      },
                    ],
                    topologyKey: "kubernetes.io/hostname",
                  },
                ],
              },
            },
            restartPolicy: "Always",
            securityContext: {
              fsGroup: "1000",
            },
            container: [
              {
                name: "runner",
                image: RUNNER_IMAGE,
                command: ["/bin/sh", "-c"],
                args: [
                  [
                    "until wget -q -O /dev/null http://127.0.0.1:2375/_ping 2>/dev/null; do",
                    "  echo 'waiting for dind'",
                    "  sleep 1",
                    "done",
                    "exec forgejo-runner daemon -c /etc/forgejo-runner/config.yml",
                  ].join("\n"),
                ],
                env: [
                  {
                    name: "DOCKER_HOST",
                    value: DOCKER_HOST,
                  },
                ],
                resources: {
                  requests: { cpu: "50m", memory: "128Mi" },
                },
                volumeMount: [
                  {
                    name: "runner-config",
                    mountPath: "/etc/forgejo-runner",
                    readOnly: true,
                  },
                  {
                    name: "runner-secrets",
                    mountPath: SECRETS_DIR,
                    readOnly: true,
                  },
                  {
                    // $HOME: action repo clones and the .runner file.
                    name: "runner-data",
                    mountPath: "/data",
                  },
                ],
              },
              {
                name: "dind",
                image: DIND_IMAGE,
                args: dindArgs,
                env: [
                  {
                    name: "DOCKER_DISABLE_CONTAINERD_SNAPSHOTTER",
                    value: "true",
                  },
                ],
                securityContext: {
                  privileged: true,
                },
                resources: {
                  requests: { cpu: "250m", memory: "512Mi" },
                },
                volumeMount: [
                  {
                    name: "docker-storage",
                    mountPath: "/var/lib/docker",
                  },
                ],
              },
              {
                // Job images come from the registry mirror, so dind's storage
                // is disposable: wipe it whenever it gets large and is idle.
                name: "docker-gc",
                image: DIND_IMAGE,
                command: ["/bin/sh", "-c"],
                args: [
                  [
                    "trap 'exit 0' TERM INT",
                    "while true; do",
                    "  sleep 600 & wait $!",
                    "  docker info >/dev/null 2>&1 || continue",
                    '  [ -n "$(docker ps -q)" ] && continue',
                    "  used=$(du -sm /var/lib/docker 2>/dev/null | cut -f1)",
                    `  if [ "$used" -gt ${DOCKER_GC_THRESHOLD_MIB} ] 2>/dev/null; then`,
                    `    echo "docker storage at $used MiB, over ${DOCKER_GC_THRESHOLD_MIB} MiB and idle: pruning"`,
                    "    docker system prune --all --force --volumes",
                    "  fi",
                    "done",
                  ].join("\n"),
                ],
                env: [
                  {
                    name: "DOCKER_HOST",
                    value: DOCKER_HOST,
                  },
                ],
                resources: {
                  requests: { cpu: "10m", memory: "16Mi" },
                },
                volumeMount: [
                  {
                    name: "docker-storage",
                    mountPath: "/var/lib/docker",
                    readOnly: true,
                  },
                ],
              },
            ],
            volume: [
              {
                name: "runner-config",
                configMap: {
                  name: `${name}-config`,
                },
              },
              {
                name: "runner-secrets",
                secret: {
                  secretName: SECRET_NAME,
                  items: [
                    { key: RUNNER_TOKEN_KEY, path: RUNNER_TOKEN_KEY },
                    { key: CACHE_SECRET_KEY, path: CACHE_SECRET_KEY },
                  ],
                },
              },
              {
                name: "runner-data",
                emptyDir: {},
              },
              {
                // Node-local; recreated with the pod.
                name: "docker-storage",
                emptyDir: {},
              },
            ],
          },
        },
      },
    });
  }
}
