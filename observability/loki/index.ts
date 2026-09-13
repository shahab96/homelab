import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { ITerraformDependable } from "cdktf";

type LokiOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
  version: string;
  dependsOn?: ITerraformDependable[];
};

export class Loki extends Construct {
  constructor(scope: Construct, id: string, options: LokiOptions) {
    super(scope, id);

    const { provider, name, namespace, version, dependsOn } = options;

    new Release(this, "loki", {
      provider,
      name,
      namespace,
      version,
      repository: "https://grafana.github.io/helm-charts",
      chart: "loki",
      dependsOn,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });
  }
}
