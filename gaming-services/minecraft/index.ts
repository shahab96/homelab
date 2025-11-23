import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";
import { OnePasswordSecret } from "../../utils";
import { TerraFirmaGreg } from "./tfg";

export class GamingServices extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const provider = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
    });

    const namespace = "minecraft";

    new NamespaceV1(this, "namespace", {
      metadata: {
        name: namespace,
      },
    });

    new OnePasswordSecret(this, "curseforge", {
      provider,
      namespace,
      name: "curseforge",
      itemPath: "vaults/Lab/items/curseforge",
    });

    new TerraFirmaGreg(this, "tfg", provider, namespace);
  }
}
