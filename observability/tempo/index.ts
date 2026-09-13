import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { ITerraformDependable } from "cdktf";

type TempoOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
  version: string;
  dependsOn?: ITerraformDependable[];
};

export class Tempo extends Construct {
  constructor(scope: Construct, id: string, options: TempoOptions) {
    super(scope, id);

    const { provider, name, namespace, version, dependsOn } = options;

    new Release(this, "tempo", {
      provider,
      name,
      namespace,
      version,
      repository: "https://grafana.github.io/helm-charts",
      chart: "tempo",
      dependsOn,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });
  }
}
