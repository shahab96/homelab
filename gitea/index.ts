import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

type GiteaServerOptions = {
  providers: {
    helm: HelmProvider;
    kubernetes: KubernetesProvider;
  };
  name: string;
  namespace: string;
  r2Endpoint: string;
};

export class GiteaServer extends Construct {
  constructor(scope: Construct, id: string, options: GiteaServerOptions) {
    super(scope, id);

    const { kubernetes, helm } = options.providers;

    new Release(this, id, {
      ...options,
      provider: helm,
      repository: "https://dl.gitea.com/charts",
      chart: "gitea",
      createNamespace: true,
      set: [
        {
          name: "gitea.config.storage.MINIO_ENDPOINT",
          value: options.r2Endpoint,
        },
      ],
      values: [
        fs.readFileSync("helm/values/gitea.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });

    new Manifest(this, `${id}-ssh-ingress`, {
      provider: kubernetes,
      manifest: {
        apiVersion: "traefik.io/v1alpha1",
        kind: "IngressRouteTCP",
        metadata: {
          name: "gitea-ssh-ingress",
          namespace: options.namespace,
        },
        spec: {
          entryPoints: ["ssh"],
          routes: [
            {
              match: "HostSNI(`*`)",
              services: [
                {
                  name: `${options.name}-ssh`,
                  port: 22,
                },
              ],
            },
          ],
        },
      },
    });
  }
}
