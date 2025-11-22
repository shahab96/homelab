import * as dotenv from "dotenv";
import { cleanEnv, str } from "envalid";
import { Construct } from "constructs";
import { App, TerraformStack, LocalBackend, PgBackend } from "cdktf";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";

import { GiteaServer } from "./gitea";
import { OnePassword } from "./1password";
import { PostgresCluster } from "./postgres";
import { Longhorn } from "./longhorn";
import { AuthentikServer } from "./authentik";
import { ValkeyCluster } from "./valkey";
import { CertManager } from "./cert-manager";
import { Traefik } from "./traefik";
import { Prometheus } from "./prometheus";
import { MetalLB } from "./metallb";
import { NixCache } from "./nixcache";

dotenv.config();

const env = cleanEnv(process.env, {
  ACCOUNT_ID: str({ desc: "Cloudflare account id." }),
  PG_CONN_STR: str({
    desc: "PostgreSQL connection string for Terraform state backend.",
  }),
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

    new NamespaceV1(this, "namespace", {
      provider: kubernetes,
      metadata: {
        name: namespace,
      },
    });

    new Longhorn(this, "longhorn", {
      name: "longhorn",
      providers: {
        kubernetes,
        helm,
      },
    });

    new MetalLB(this, "metallb", {
      provider: helm,
      name: "metallb",
      namespace: "metallb-system",
    });

    new OnePassword(this, "one-password", {
      provider: kubernetes,
      namespace,
    });

    new Traefik(this, "traefik", {
      provider: helm,
      namespace,
      name: "traefik",
    });

    const certManagerApiVersion = "cert-manager.io/v1";

    new CertManager(this, "cert-manager", {
      certManagerApiVersion,
      name: "cert-manager",
      namespace,
      version: "1.18.2",
      providers: {
        kubernetes,
        helm,
      },
    });

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
      users: ["shahab", "budget-tracker", "authentik", "gitea"],
      primaryUser: "shahab",
      initSecretName: "postgres-password",
      backupR2EndpointURL: r2Endpoint,
    });

    const valkey = new ValkeyCluster(this, "valkey-cluster", {
      provider: kubernetes,
      namespace,
      name: "valkey",
    });

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
      providers: {
        helm,
        kubernetes,
      },
      r2Endpoint: `${env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
    });

    gitea.node.addDependency(authentik);
  }
}

const app = new App();
const homelab = new Homelab(app, "homelab");

const nixCache = new NixCache(app, "nix-cache");
nixCache.node.addDependency(homelab);

new LocalBackend(homelab, {
  path: "terraform.tfstate",
  workspaceDir: ".",
});

new PgBackend(nixCache, {
  schemaName: "nix_cache",
  connStr: env.PG_CONN_STR,
});

app.synth();
