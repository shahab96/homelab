import * as fs from "fs";
import * as path from "path";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type TraefikOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
};

export class Traefik extends Construct {
  constructor(scope: Construct, id: string, options: TraefikOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
      repository: "https://traefik.github.io/charts",
      chart: "traefik",
      createNamespace: true,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });
  }
}
