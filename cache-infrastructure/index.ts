import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";
import { NixCache } from "./nix";
import { NpmCache } from "./npm";
import { PipCache } from "./pip";
import { GoCache } from "./go";
import { DockerRegistryCache } from "./docker";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DataKubernetesSecretV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-secret-v1";
import { OnePasswordSecret } from "../utils";

export class CacheInfrastructure extends TerraformStack {
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

    const namespace = "package-cache";

    new NamespaceV1(this, "package-cache-namespace", {
      provider: kubernetes,
      metadata: {
        name: namespace,
      },
    });

    new OnePasswordSecret(this, "s3-creds", {
      provider: kubernetes,
      namespace,
      name: "rustfs-credentials",
      itemPath: "vaults/Lab/items/rustfs-credentials",
    });

    const caSecret = new DataKubernetesSecretV1(this, "ca-secret", {
      provider: kubernetes,
      metadata: {
        name: "homelab-ca-secret",
        namespace: "homelab",
      },
    });

    new ConfigMapV1(this, "ca-configmap", {
      provider: kubernetes,
      metadata: {
        name: "rustfs-ca",
        namespace,
      },
      data: {
        "ca.crt": caSecret.data.lookup("ca.crt"),
      },
    });

    // Add cache-related infrastructure components here
    new NixCache(this, "nix-cache", {
      provider: kubernetes,
      namespace,
      name: "nix-cache",
      host: "nix.dogar.dev",
    });

    new NpmCache(this, "npm-cache", {
      providers: { kubernetes, helm },
      namespace,
      name: "npm-cache",
      host: "npm.dogar.dev",
    });

    new PipCache(this, "pip-cache", {
      provider: kubernetes,
      namespace,
      name: "pip-cache",
      host: "pip.dogar.dev",
    });

    new GoCache(this, "go-cache", {
      providers: {
        kubernetes,
        helm,
      },
      namespace,
      name: "go-cache",
      host: "go.dogar.dev",
    });

    new DockerRegistryCache(this, "docker-cache", {
      provider: kubernetes,
      namespace,
      name: "docker-cache",
      host: "docker.dogar.dev",
      upstreamUrl: "https://registry-1.docker.io",
      bucket: "docker-cache",
    });

    new DockerRegistryCache(this, "ghcr-cache", {
      provider: kubernetes,
      namespace,
      name: "ghcr-cache",
      host: "ghcr.dogar.dev",
      upstreamUrl: "https://ghcr.io",
      bucket: "ghcr-cache",
    });

    new DockerRegistryCache(this, "quay-cache", {
      provider: kubernetes,
      namespace,
      name: "quay-cache",
      host: "quay.dogar.dev",
      upstreamUrl: "https://quay.io",
      bucket: "quay-cache",
    });
  }
}
