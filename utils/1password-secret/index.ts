import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

type SecretOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;
  itemPath: string;
};

export class OnePasswordSecret extends Construct {
  constructor(scope: Construct, id: string, options: SecretOptions) {
    super(scope, id);

    const { itemPath, name, namespace, provider } = options;

    new Manifest(this, name, {
      provider,
      manifest: {
        apiVersion: "onepassword.com/v1",
        kind: "OnePasswordItem",
        metadata: {
          name,
          namespace,
          annotations: {
            "operator.1password.io/auto-restart": "true",
          },
        },
        spec: {
          itemPath,
        },
      },
    });
  }
}
