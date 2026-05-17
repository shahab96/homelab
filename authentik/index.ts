import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { AuthentikProvider } from "../.gen/providers/authentik/provider";
import { Blueprint } from "../.gen/providers/authentik/blueprint";
import * as fs from "fs";
import * as path from "path";

export class Authentik extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const authentik = new AuthentikProvider(this, "authentik", {
      url: "https://auth.dogar.dev",
      token: process.env.AUTHENTIK_TOKEN!,
    });

    const blueprintYaml = fs.readFileSync(
      path.join(__dirname, "blueprints", "user-invite.yaml"),
      "utf8"
    );

    new Blueprint(this, "user-invite", {
      provider: authentik,
      name: "user-invite",
      content: blueprintYaml,
    });
  }
}
