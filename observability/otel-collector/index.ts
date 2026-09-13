import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { ITerraformDependable } from "cdktf";

type OtelCollectorOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
  version: string;
  dependsOn?: ITerraformDependable[];
};

export class OtelCollector extends Construct {
  constructor(scope: Construct, id: string, options: OtelCollectorOptions) {
    super(scope, id);

    const { provider, name, namespace, version, dependsOn } = options;

    new Release(this, "otel-collector", {
      provider,
      name,
      namespace,
      version,
      repository: "https://open-telemetry.github.io/opentelemetry-helm-charts",
      chart: "opentelemetry-collector",
      dependsOn,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });
  }
}
