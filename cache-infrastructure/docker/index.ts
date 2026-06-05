import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { PublicIngressRoute } from "../../utils";

type DockerRegistryCacheOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  host: string;
  upstreamUrl?: string;
  bucket: string;
};

export class DockerRegistryCache extends Construct {
  constructor(scope: Construct, id: string, options: DockerRegistryCacheOptions) {
    super(scope, id);

    const { provider, name, namespace, host, upstreamUrl, bucket } = options;

    const registryConfig = fs.readFileSync(
      path.join(__dirname, "./config.yml"),
      "utf-8",
    );

    new ConfigMapV1(this, "config", {
      provider,
      metadata: { name, namespace },
      data: { "config.yml": registryConfig },
    });

    new ServiceV1(this, "service", {
      provider,
      metadata: { name, namespace },
      spec: {
        selector: { app: name },
        port: [{
          name: "http",
          port: 5000,
          targetPort: "5000",
        }],
        type: "ClusterIP",
      },
    });

    const env: Array<{
      name: string;
      value?: string;
      valueFrom?: {
        secretKeyRef: {
          name: string;
          key: string;
        };
      };
    }> = [];

    env.push({ name: "REGISTRY_STORAGE_S3_BUCKET", value: bucket });

    env.push({
      name: "REGISTRY_STORAGE_S3_ACCESSKEY",
      valueFrom: {
        secretKeyRef: {
          name: "rustfs-credentials",
          key: "accesskey",
        },
      },
    });

    env.push({
      name: "REGISTRY_STORAGE_S3_SECRETKEY",
      valueFrom: {
        secretKeyRef: {
          name: "rustfs-credentials",
          key: "secretkey",
        },
      },
    });

    if (upstreamUrl) {
      env.push({ name: "REGISTRY_PROXY_REMOTEURL", value: upstreamUrl });
    }

    new DeploymentV1(this, "deployment", {
      provider,
      metadata: { name, namespace },
      spec: {
        replicas: "1",
        strategy: { type: "Recreate" },
        selector: { matchLabels: { app: name } },
        template: {
          metadata: { labels: { app: name } },
          spec: {
            container: [{
              name: "registry",
              image: "registry:2",
              env,
              port: [{ containerPort: 5000 }],
              volumeMount: [
                { name: "config", mountPath: "/etc/docker/registry/config.yml", subPath: "config.yml" },
              ],
            }],
            volume: [
              { name: "config", configMap: { name } },
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
      servicePort: 5000,
    });
  }
}
