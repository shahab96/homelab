import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type GiteaServerOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
  r2Endpoint: string;
};

export class GiteaServer extends Construct {
  constructor(scope: Construct, id: string, options: GiteaServerOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
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
  }
}
