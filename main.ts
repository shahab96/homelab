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
import { ValkeyCluster } from "./valkey";
import { CertManager } from "./cert-manager";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { PiHole } from "./pihole";
import { Nginx } from "./nginx";
import { Prometheus } from "./prometheus";
import { MetalLB } from "./metallb";

dotenv.config();

const env = cleanEnv(process.env, {
  R2_ACCESS_KEY_ID: str(),
  R2_SECRET_ACCESS_KEY: str(),
  ACCOUNT_ID: str({ desc: "Cloudflare account id." }),
  BUCKET: str({ desc: "The name of the R2 bucket." }),
});

const r2Endpoint = `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com`;

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

    const namespace = "homelab";

    const ns = new Manifest(this, "namespace", {
      provider: kubernetes,
      manifest: {
        kind: "Namespace",
        apiVersion: "v1",
        metadata: {
          name: namespace,
        },
        spec: {},
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

    const longhorn = new Longhorn(this, "longhorn", {
      namespace,
      name: "longhorn",
      providers: {
        kubernetes,
        helm,
      },
    });

    longhorn.node.addDependency(ns);

    new MetalLB(this, "metallb", {
      provider: helm,
      name: "metallb",
      namespace,
    });

    new OnePassword(this, "one-password", {
      provider: kubernetes,
      namespace,
    });

    const nginx = new Nginx(this, "nginx", {
      provider: helm,
      namespace,
      name: "nginx-ingress",
    });

    const certManagerApiVersion = "cert-manager.io/v1";

    const cm = new CertManager(this, "cert-manager", {
      certManagerApiVersion,
      name: "cert-manager",
      namespace,
      version: "1.18.2",
      providers: {
        kubernetes,
        helm,
      },
    });

    const pihole = new PiHole(this, "pihole", {
      namespace,
      provider: helm,
      name: "pihole",
    });

    pihole.node.addDependency(longhorn);
    pihole.node.addDependency(nginx);
    pihole.node.addDependency(cm);

    new Prometheus(this, "prometheus", {
      provider: helm,
      namespace,
      name: "prometheus-operator",
      version: "75.10.0",
    });

    const pg = new PostgresCluster(this, "postgres-cluster", {
      certManagerApiVersion,
      name: "postgres-cluster",
      namespace,
      providers: {
        kubernetes,
        helm,
      },
      storageClass: "longhorn-crypto",
      users: ["shahab", "budget-tracker", "authentik", "gitea"],
      primaryUser: "shahab",
      initSecretName: "postgres-password",
      backupR2EndpointURL: r2Endpoint,
    });

    pg.node.addDependency(pihole);

    const valkey = new ValkeyCluster(this, "valkey-cluster", {
      provider: kubernetes,
      namespace,
      name: "valkey",
    });

    valkey.node.addDependency(pihole);

    const authentik = new AuthentikServer(this, "authentik-server", {
      provider: helm,
      name: "authentik",
      namespace,
    });

    authentik.node.addDependency(pg);
    authentik.node.addDependency(valkey);

    const gitea = new GiteaServer(this, "gitea-server", {
      name: "gitea",
      namespace,
      provider: helm,
    });

    gitea.node.addDependency(authentik);
  }
}

const app = new App();
const stack = new Homelab(app, "homelab");

new S3Backend(stack, {
  encrypt: true,
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
    s3: `${r2Endpoint}/${env.BUCKET}`,
  },
});

app.synth();
