import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";
import { IngressRoute, OnePasswordSecret } from "../../utils";
import { Providers } from "../../types";

type AuthentikServerOptions = {
  providers: Providers;
  name: string;
  namespace: string;
};

export class AuthentikServer extends Construct {
  constructor(scope: Construct, id: string, options: AuthentikServerOptions) {
    super(scope, id);

    const { kubernetes, helm } = options.providers;

    new OnePasswordSecret(this, "secret-key", {
      provider: kubernetes,
      name: "authentik-secret-key",
      namespace: options.namespace,
      itemPath: "vaults/Lab/items/authentik-secret-key",
    });

    new OnePasswordSecret(this, "smtp", {
      provider: kubernetes,
      name: "authentik-smtp-token",
      namespace: options.namespace,
      itemPath: "vaults/Lab/items/smtp-token",
    });

    new Release(this, id, {
      ...options,
      provider: helm,
      repository: "https://charts.goauthentik.io",
      chart: "authentik",
      createNamespace: true,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });

    new IngressRoute(this, "ingress", {
      provider: kubernetes,
      name: options.name,
      namespace: options.namespace,
      host: "auth.dogar.dev",
      serviceName: `authentik-server`,
      servicePort: 80,
      tlsSecretName: "authentik-tls",
    });
  }
}
