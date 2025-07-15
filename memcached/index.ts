import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type MemcachedClusterOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
};

export class MemcachedCluster extends Construct {
  constructor(scope: Construct, id: string, options: MemcachedClusterOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
      repository: "https://charts.bitnami.com/bitnami",
      chart: "memcached",
      createNamespace: true,
      values: [
        fs.readFileSync("helm/values/memcached.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });
  }
}
