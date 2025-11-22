import * as fs from "fs";
import * as path from "path";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type MetalLBOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
};

export class MetalLB extends Construct {
  constructor(scope: Construct, id: string, options: MetalLBOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
      repository: "https://metallb.github.io/metallb",
      chart: "metallb",
      createNamespace: true,
      values: [fs.readFileSync(path.join(__dirname, "values.yaml"), "utf8")],
    });
  }
}
