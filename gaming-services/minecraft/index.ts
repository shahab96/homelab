import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";
import { OnePasswordSecret } from "../../utils";
import { AllTheMods9 } from "./atm9";
import { TerraFirmaGreg } from "./tfg";
// import { GTNH } from "./gtnh";

export class GamingServices extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const provider = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
    });

    const namespace = "minecraft";

    const minecraftNamespace = new NamespaceV1(this, "namespace", {
      metadata: {
        name: namespace,
      },
    });

    const curseforge = new OnePasswordSecret(this, "curseforge", {
      provider,
      namespace,
      name: "curseforge",
      itemPath: "vaults/Lab/items/curseforge",
    });
    curseforge.node.addDependency(minecraftNamespace);

    const atm9 = new AllTheMods9(this, "atm9", provider, namespace);
    atm9.node.addDependency(curseforge);

    new TerraFirmaGreg(this, "tfg", provider, namespace);
    // new GTNH(this, "gtnh", provider, namespace);
  }
}
