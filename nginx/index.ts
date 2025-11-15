import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

import { NixCache } from "./nix-cache";

type NginxOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
};

export class Nginx extends Construct {
  constructor(scope: Construct, id: string, options: NginxOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
      repository: "https://kubernetes.github.io/ingress-nginx",
      chart: "ingress-nginx",
      createNamespace: true,
      values: [
        fs.readFileSync("helm/values/nginx-internal.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });

    new NixCache(this, "nix-cache", {
      namespace: options.namespace,
      host: "nix.dogar.dev",
      ingressClassName: "nginx-internal",
    });
  }
}
