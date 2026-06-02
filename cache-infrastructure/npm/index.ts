import * as path from "path";
import * as fs from "fs";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

import { PublicIngressRoute } from "../../utils";
import { Providers } from "../../types";

type NpmCacheOptions = {
  providers: Providers;
  namespace: string;
  name: string;
  host: string;
};

export class NpmCache extends Construct {
  constructor(scope: Construct, id: string, opts: NpmCacheOptions) {
    super(scope, id);

    const { namespace, name, host } = opts;
    const { helm, kubernetes } = opts.providers;

    new Release(this, "helm-release", {
      provider: helm,
      name,
      namespace,
      repository: "https://charts.verdaccio.org",
      chart: "verdaccio",
      version: "4.31.0",
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), { encoding: "utf-8" }),
      ],
    });

    new PublicIngressRoute(this, "ingress", {
      provider: kubernetes,
      namespace,
      name,
      host,
      serviceName: name,
      servicePort: 4873,
    });
  }
}
