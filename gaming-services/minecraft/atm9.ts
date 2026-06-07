import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

import { MinecraftServer } from "./utils";

export class AllTheMods9 extends Construct {
  constructor(
    scope: Construct,
    id: string,
    provider: KubernetesProvider,
    namespace: string,
  ) {
    super(scope, id);

    new MinecraftServer(this, "atm9", {
      provider,
      namespace,
      image: "itzg/minecraft-server:java17",
      name: "atm9",
      size: "10Gi",
      env: [
        {
          name: "EULA",
          value: "TRUE",
        },
        {
          name: "MODE",
          value: "survival",
        },
        {
          name: "DIFFICULTY",
          value: "peaceful",
        },
        {
          name: "MODPACK_PLATFORM",
          value: "AUTO_CURSEFORGE",
        },
        {
          name: "CF_API_KEY",
          valueFrom: {
            secretKeyRef: {
              name: "curseforge",
              key: "credential",
            },
          },
        },
        {
          name: "CF_PAGE_URL",
          value: "https://www.curseforge.com/minecraft/modpacks/all-the-mods-9",
        },
        {
          name: "REMOVE_MODS",
          value: "mekalus",
        },
        {
          name: "MEMORY",
          value: "10G",
        },
      ],
    });
  }
}
