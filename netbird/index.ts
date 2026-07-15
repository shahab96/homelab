import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { OnePasswordSecret } from "../utils";

export class Netbird extends TerraformStack {
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

    const namespace = "netbird";

    // Create namespace
    new NamespaceV1(this, "namespace", {
      metadata: {
        name: namespace,
      },
    });

    new Release(this, "netbird", {
      provider: helm,
      namespace,
      createNamespace: true,
      name: "netbird",
      repository: "oci://ghcr.io/netbirdio/helm-charts",
      chart: "netbird-operator",
      upgradeInstall: true,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), "utf-8"),
      ],
    });

    new OnePasswordSecret(this, "netbird-mgmt-api-key", {
      name: "netbird-mgmt-api-key",
      namespace,
      provider: kubernetes,
      itemPath: "vaults/Lab/items/netbird-mgmt-api-key",
    });
  }
}
