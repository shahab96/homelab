import * as fs from "fs";
import * as path from "path";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

type LonghornOptions = {
  providers: {
    kubernetes: KubernetesProvider;
    helm: HelmProvider;
  };
  name: string;
};

export class Longhorn extends Construct {
  constructor(scope: Construct, id: string, options: LonghornOptions) {
    super(scope, id);

    const { helm, kubernetes } = options.providers;
    const namespace = "longhorn-system";

    new Release(this, id, {
      name: options.name,
      namespace,
      provider: helm,
      repository: "https://charts.longhorn.io",
      chart: "longhorn",
      createNamespace: true,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });

    new Manifest(this, "recurring-backup-job", {
      provider: kubernetes,
      manifest: {
        apiVersion: "longhorn.io/v1beta2",
        kind: "RecurringJob",
        metadata: {
          name: "daily-backup",
          namespace,
        },
        spec: {
          cron: "0 0 * * *",
          task: "backup",
          retain: 7,
          concurrency: 10,
        },
      },
    });
  }
}
