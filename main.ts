import * as dotenv from "dotenv";
import { cleanEnv, str } from "envalid";
import { Construct } from "constructs";
import { App, TerraformStack, S3Backend } from "cdktf";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";

import { GiteaServer } from "./gitea/server";

dotenv.config();

const env = cleanEnv(process.env, {
  R2_ACCESS_KEY_ID: str(),
  R2_SECRET_ACCESS_KEY: str(),
  ACCOUNT_ID: str({ desc: "Cloudflare account id." }),
  BUCKET: str({ desc: "The name of the R2 bucket." }),
});

class Homelab extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const helm = new HelmProvider(this, "helm", {
      kubernetes: {
        configPath: "~/.kube/config",
      },
    });

    new GiteaServer(this, "gitea-server", {
      name: "gitea",
      namespace: "gitea-system",
      provider: helm,
      version: "10.4.0",
    });
  }
}

const app = new App();
const stack = new Homelab(app, "homelab");

new S3Backend(stack, {
  bucket: env.BUCKET,
  key: "terraform.tfstate",
  region: "auto",
  skipCredentialsValidation: true,
  skipMetadataApiCheck: true,
  skipRegionValidation: true,
  skipRequestingAccountId: true,
  skipS3Checksum: true,
  accessKey: env.R2_ACCESS_KEY_ID,
  secretKey: env.R2_SECRET_ACCESS_KEY,
  endpoints: {
    s3: `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com/homelab-terraform-state`,
  },
});

app.synth();
