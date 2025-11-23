import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

import { MinecraftServer } from "./utils";

export class GTNH extends Construct {
  constructor(
    scope: Construct,
    id: string,
    provider: KubernetesProvider,
    namespace: string,
  ) {
    super(scope, id);

    new MinecraftServer(this, "gtnh", {
      provider,
      namespace,
      image: "itzg/minecraft-server:java25",
      name: "gtnh",
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
          value: "easy",
        },
        {
          name: "TYPE",
          value: "CUSTOM",
        },
        {
          name: "GENERIC_PACKS",
          value: "GT_New_Horizons_2.8.0_Server_Java_17-25",
        },
        {
          name: "GENERIC_PACKS_SUFFIX",
          value: ".zip",
        },
        {
          name: "GENERIC_PACKS_PREFIX",
          value: "https://downloads.gtnewhorizons.com/ServerPacks/",
        },
        {
          name: "SKIP_GENERIC_PACK_UPDATE_CHECK",
          value: "true",
        },
        {
          name: "MEMORY",
          value: "12G",
        },
        {
          name: "JVM_OPTS",
          value:
            "-Dfml.readTimeout=180 -Dfml.queryResult=confirm @java9args.txt",
        },
        {
          name: "CUSTOM_JAR_EXEC",
          value: "-jar lwjgl3ify-forgePatches.jar nogui",
        },
        {
          name: "ALLOW_FLIGHT",
          value: "TRUE",
        },
        {
          name: "ENABLE_ROLLING_LOGS",
          value: "TRUE",
        },
      ],
    });
  }
}
