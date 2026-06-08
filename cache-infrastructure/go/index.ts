import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

import { PublicIngressRoute } from "../../utils";
import { Providers } from "../../types";

type GoCacheOptions = {
  providers: Providers;
  namespace: string;
  name: string;
  host: string;
};

export class GoCache extends Construct {
  constructor(scope: Construct, id: string, opts: GoCacheOptions) {
    super(scope, id);

    const { namespace, name, host } = opts;
    const { helm, kubernetes } = opts.providers;

    new Release(this, "helm-release", {
      provider: helm,
      name,
      namespace,
      repository: "https://gomods.github.io/athens-charts",
      chart: "athens-proxy",
      values: [fs.readFileSync(path.join(__dirname, "values.yaml"), "utf8")],
    });

    new PublicIngressRoute(this, "ingress", {
      provider: kubernetes,
      namespace,
      name,
      host,
      serviceName: `${name}-athens-proxy`,
      servicePort: 80,
    });
  }
}
