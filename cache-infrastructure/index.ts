import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";
import { NixCache } from "./nix";
import { NpmCache } from "./npm";

export class CacheInfrastructure extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const provider = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
    });

    const namespace = "package-cache";

    new NamespaceV1(this, "package-cache-namespace", {
      metadata: {
        name: namespace,
      },
    });

    // Add cache-related infrastructure components here
    new NixCache(this, "nix-cache", {
      provider,
      namespace,
      name: "nix-cache",
      host: "nix.dogar.dev",
    });

    new NpmCache(this, "npm-cache", {
      provider,
      namespace,
      name: "npm-cache",
      host: "npm.dogar.dev",
    });
  }
}
