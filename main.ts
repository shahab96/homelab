import * as dotenv from "dotenv";
import { cleanEnv, str } from "envalid";
import { Construct } from "constructs";
import { App, TerraformStack, LocalBackend, TerraformOutput } from "cdktf";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";

import { Longhorn } from "./longhorn";
import { CertManager } from "./cert-manager";
import { Traefik } from "./traefik";
import { MetalLB } from "./metallb";
import { CacheInfrastructure } from "./cache-infrastructure";
import { UtilityServices } from "./utility-services";
import { K8SOperators } from "./k8s-operators";

dotenv.config();

cleanEnv(process.env, {
  ACCOUNT_ID: str({ desc: "Cloudflare account id." }),
  OP_CONNECT_TOKEN: str({ desc: "1Password Connect token." }),
});

class CoreServices extends TerraformStack {
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

    new TerraformOutput(this, "namespace-output", {
      value: namespace,
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

    new Traefik(this, "traefik", {
      provider: helm,
      namespace,
      name: "traefik",
    });

    new CertManager(this, "cert-manager", {
      certManagerApiVersion: "cert-manager.io/v1",
      name: "cert-manager",
      namespace,
      version: "1.18.2",
      providers: {
        kubernetes,
        helm,
      },
    });
  }
}

const app = new App();
const coreServices = new CoreServices(app, "homelab");

const k8sOperators = new K8SOperators(app, "k8s-operators");
k8sOperators.node.addDependency(coreServices);

const utilityServices = new UtilityServices(app, "utility-services");
utilityServices.node.addDependency(k8sOperators);

const caches = new CacheInfrastructure(app, "cache-infrastructure");
caches.node.addDependency(utilityServices);

new LocalBackend(coreServices, {
  path: "terraform.tfstate",
  workspaceDir: ".",
});

new LocalBackend(caches, {
  path: "terraform.tfstate",
  workspaceDir: "./cachestf",
});

new LocalBackend(utilityServices, {
  path: "terraform.tfstate",
  workspaceDir: "./utilityservicestf",
});

new LocalBackend(k8sOperators, {
  path: "terraform.tfstate",
  workspaceDir: "./k8soperatorstf",
});

app.synth();
