import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";
import { Construct } from "constructs";
import { OnePasswordSecret } from "../../utils";

type ValkeyClusterOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
};

export class ValkeyCluster extends Construct {
  constructor(scope: Construct, id: string, options: ValkeyClusterOptions) {
    super(scope, id);

    // Labels used by both Deployment and Service
    const labels = { app: "valkey" };
    const { provider, name, namespace } = options;

    new OnePasswordSecret(this, "secret", {
      provider,
      name: "valkey",
      namespace,
      itemPath: "vaults/Lab/items/valkey",
    });

    new DeploymentV1(this, "deployment", {
      provider,
      metadata: {
        name,
        namespace,
        labels,
      },
      spec: {
        replicas: "1",
        strategy: {
          type: "RollingUpdate",
          rollingUpdate: {
            maxSurge: "1",
            maxUnavailable: "0",
          },
        },
        selector: { matchLabels: labels },
        template: {
          metadata: { labels },
          spec: {
            container: [
              {
                name: "valkey",
                image: "docker.io/valkey/valkey:8.1.3",
                port: [{ name: "client", containerPort: 6379 }],
                env: [
                  {
                    name: "PASSWORD",
                    valueFrom: {
                      secretKeyRef: {
                        name: "valkey",
                        key: "password",
                      },
                    },
                  },
                ],
                command: ["/bin/sh", "-c"],
                args: ['exec valkey-server --requirepass "$PASSWORD"'],
                readinessProbe: {
                  tcpSocket: [
                    {
                      port: "6379",
                    },
                  ],
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                  timeoutSeconds: 3,
                  failureThreshold: 5,
                },
                livenessProbe: {
                  tcpSocket: [
                    {
                      port: "6379",
                    },
                  ],
                  initialDelaySeconds: 20,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 5,
                },
                resources: {
                  requests: {
                    cpu: "100m",
                    memory: "128Mi",
                  },
                  limits: {
                    memory: "512Mi",
                  },
                },
              },
            ],
          },
        },
      },
    });

    new ServiceV1(this, "valkey-service", {
      provider,
      metadata: {
        name,
        namespace,
        labels,
      },
      spec: {
        type: "ClusterIP",
        selector: labels,
        port: [
          {
            name: "client",
            port: 6379,
            targetPort: "client",
          },
        ],
      },
    });
  }
}
