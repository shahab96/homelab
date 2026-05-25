import * as fs from "fs";
import * as path from "path";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type CiliumOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
};

export class Cilium extends Construct {
  constructor(scope: Construct, id: string, options: CiliumOptions) {
    super(scope, id);

    const { namespace, name, provider } = options;

    new Release(this, id, {
      provider,
      name,
      namespace,
      repository: "https://helm.cilium.io/",
      chart: "cilium",
      version: "1.19.4",
      createNamespace: false,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });
  }
}
