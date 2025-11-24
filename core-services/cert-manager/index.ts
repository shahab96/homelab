import * as fs from "fs";
import * as path from "path";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type CertManagerOptions = {
  provider: HelmProvider;
  version: string;
  name: string;
  namespace: string;
};

export class CertManager extends Construct {
  constructor(scope: Construct, id: string, options: CertManagerOptions) {
    super(scope, id);

    const { namespace, name, version, provider } = options;

    new Release(this, id, {
      provider,
      name,
      namespace,
      version,
      repository: "https://charts.jetstack.io",
      chart: "cert-manager",
      createNamespace: true,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });
  }
}
