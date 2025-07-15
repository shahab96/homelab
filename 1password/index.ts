import * as fs from "fs";
import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

type OnePasswordSecret = {
  name: string;
  namespace: string;
  itemPath: string;
};

type OnePasswordOptions = {
  provider: KubernetesProvider;
};

export class OnePassword extends Construct {
  constructor(scope: Construct, id: string, options: OnePasswordOptions) {
    super(scope, id);

    const secrets: OnePasswordSecret[] = JSON.parse(
      fs.readFileSync("1password/secrets.json", {
        encoding: "utf8",
      }),
    );

    secrets.forEach((secret) => {
      new Manifest(this, secret.name, {
        provider: options.provider,
        manifest: {
          apiVersion: "onepassword.com/v1",
          kind: "OnePasswordItem",
          metadata: {
            name: secret.name,
            namespace: secret.namespace,
            annotations: {
              "operator.1password.io/auto-restart": "true",
            },
          },
          spec: {
            itemPath: secret.itemPath,
          },
        },
      });
    });
  }
}
