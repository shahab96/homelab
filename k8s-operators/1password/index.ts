import * as fs from "fs";
import * as path from "path";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type OnePasswordOptions = {
  provider: HelmProvider;
  name: string;
};

export class OnePassword extends Construct {
  constructor(scope: Construct, id: string, options: OnePasswordOptions) {
    super(scope, id);

    const { provider } = options;

    new Release(this, "onepassword-operator", {
      provider,
      name: "onepassword-operator",
      chart: "connect",
      repository: "https://1password.github.io/connect-helm-charts/",
      namespace: "1password",
      createNamespace: true,
      set: [
        {
          name: "operator.create",
          value: "true",
        },
      ],
      setSensitive: [
        {
          name: "operator.token.value",
          value: process.env.OP_CONNECT_TOKEN!,
        },
        {
          name: "connect.credentials_base64",
          value: btoa(
            fs.readFileSync(
              path.join(__dirname, "1password-credentials.json"),
              "utf-8",
            ),
          ),
        },
      ],
    });
  }
}
