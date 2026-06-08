import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";
import { NixCache } from "./nix";
import { PackageProxy } from "./package-proxy";
import { DockerRegistryCache } from "./docker";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DataKubernetesSecretV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-secret-v1";
import { OnePasswordSecret } from "../utils";

export class CacheInfrastructure extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const kubernetes = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
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

    new PackageProxy(this, "package-proxy", {
      provider: kubernetes,
      namespace,
      name: "package-proxy",
      host: "pkgs.dogar.dev",
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
