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
          name: "CF_FILENAME_MATCHER",
          value: "9-1.1.1",
        },
        {
          name: "VERSION",
          value: "1.20.1",
        },
        {
          name: "INIT_MEMORY",
          value: "2G",
        },
        {
          name: "MAX_MEMORY",
          value: "10G",
        },
        {
          name: "ALLOW_FLIGHT",
          value: "TRUE",
        },
        {
          name: "ENABLE_ROLLING_LOGS",
          value: "TRUE",
        },
        {
          name: "USE_MEOWICE_FLAGS",
          value: "TRUE",
        },
      ],
    });
  }
}
