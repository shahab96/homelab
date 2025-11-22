import { Construct } from "constructs";
import { NullProvider } from "@cdktf/provider-null/lib/provider";
import { Resource } from "@cdktf/provider-null/lib/resource";

export interface BarmanCloudPluginInstallOptions {
  /** URL to the CloudNativePG barman-cloud plugin manifest */
  url: string;
}

export class BarmanCloudPluginInstall extends Construct {
  constructor(
    scope: Construct,
    id: string,
    opts: BarmanCloudPluginInstallOptions,
  ) {
    super(scope, id);

    const { url } = opts;

    const applyCmd = ["kubectl", "apply", "-f", url].join(" ");
    const deleteCmd = ["kubectl", "delete", "-f", url].join(" ");

    new Resource(this, "barman-install", {
      provider: new NullProvider(this, "barman"),
      provisioners: [
        {
          type: "local-exec",
          when: "create",
          command: applyCmd,
        },
        {
          type: "local-exec",
          when: "destroy",
          command: deleteCmd,
        },
      ],
      triggers: {
        url,
      },
    });
  }
}
