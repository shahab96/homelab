import * as dotenv from "dotenv";
import { cleanEnv, str } from "envalid";
import { Construct } from "constructs";
import { App, TerraformStack, S3Backend } from "cdktf";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

import { GiteaServer } from "./gitea";
import { OnePassword } from "./1password";
import { PostgresCluster } from "./postgres";
import { Longhorn } from "./longhorn";
import { AuthentikServer } from "./authentik";
import { RedisCluster } from "./redis";
import { CertManager } from "./cert-manager";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { PiHole } from "./pihole";

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

    const kubernetes = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
    });

    const helm = new HelmProvider(this, "helm", {
      kubernetes: {
        configPath: "~/.kube/config",
      },
    });

    new Manifest(this, "core-dns", {
      provider: kubernetes,
      manifest: {
        kind: "ConfigMap",
        apiVersion: "v1",
        metadata: {
          name: "coredns-custom",
          namespace: "kube-system",
        },
        data: {
          "forward.override": `forward . /etc/resolv.conf {
              policy sequential
            }
          `,
        },
      },
    });

    new Longhorn(this, "longhorn", {
      namespace: "longhorn-system",
      name: "longhorn",
      version: "1.7.0",
      providers: {
        kubernetes,
        helm,
      },
    });

    new PiHole(this, "pihole", {
      namespace: "pihole-system",
      provider: helm,
      name: "pihole",
      version: "2.26.1",
    });

    const certManagerApiVersion = "cert-manager.io/v1";

    new CertManager(this, "cert-manager", {
      certManagerApiVersion,
      name: "cert-manager",
      namespace: "cert-manager",
      version: "1.15.3",
      providers: {
        kubernetes,
        helm,
      },
    });

    new PostgresCluster(this, "postgres-cluster", {
      certManagerApiVersion,
      name: "postgres-cluster",
      namespace: "postgres-system",
      providers: {
        kubernetes,
        helm,
      },
      storageClass: "longhorn-crypto",
      users: ["shahab"],
      primaryUser: "shahab",
      initSecretName: "postgres-password",
    });

    new RedisCluster(this, "redis-cluster", {
      provider: helm,
      namespace: "redis-system",
      name: "redis",
      version: "20.2.0",
    });

    new AuthentikServer(this, "authentik-server", {
      provider: helm,
      name: "authentik",
      namespace: "authentik-system",
      version: "2024.10.5",
    });

    new GiteaServer(this, "gitea-server", {
      name: "gitea",
      namespace: "gitea-system",
      provider: helm,
      version: "10.4.0",
    });

    new OnePassword(this, "one-password", {
      provider: kubernetes,
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
