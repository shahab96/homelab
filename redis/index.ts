import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type RedisClusterOptions = {
  provider: HelmProvider;
  version: string;
  name: string;
  namespace: string;
};

export class RedisCluster extends Construct {
  constructor(scope: Construct, id: string, options: RedisClusterOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
      repository: "https://charts.bitnami.com/bitnami",
      chart: "redis",
      createNamespace: true,
      values: [
        fs.readFileSync("helm/values/redis.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });
  }
}
