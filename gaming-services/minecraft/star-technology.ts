import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

import { MinecraftServer } from "./utils";

export class StarTechnology extends Construct {
  constructor(
    scope: Construct,
    id: string,
    provider: KubernetesProvider,
    namespace: string,
  ) {
    super(scope, id);

    new MinecraftServer(this, "star-technology", {
      provider,
      namespace,
      image: "itzg/minecraft-server:java21",
      name: "star-technology",
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
          value:
            "https://www.curseforge.com/minecraft/modpacks/star-technology",
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
          value: "12G",
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
