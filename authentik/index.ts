import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type AuthentikServerOptions = {
  provider: HelmProvider;
  version: string;
  name: string;
  namespace: string;
};

export class AuthentikServer extends Construct {
  constructor(scope: Construct, id: string, options: AuthentikServerOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
      repository: "https://charts.goauthentik.io",
      chart: "authentik",
      createNamespace: true,
      values: [
        fs.readFileSync("helm/values/authentik.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });
  }
}
