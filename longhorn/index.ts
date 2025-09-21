import * as fs from "fs";
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
  namespace: string;
};

export class Longhorn extends Construct {
  constructor(scope: Construct, id: string, options: LonghornOptions) {
    super(scope, id);

    const { helm, kubernetes } = options.providers;

    new Release(this, id, {
      name: options.name,
      namespace: options.namespace,
      provider: helm,
      repository: "https://charts.longhorn.io",
      chart: "longhorn",
      createNamespace: true,
      upgradeInstall: true,
      values: [
        fs.readFileSync("helm/values/longhorn.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });

    new Manifest(this, "recurring-backup-job", {
      provider: kubernetes,
      manifest: {
        apiVersion: "longhorn.io/v1beta1",
        kind: "RecurringJob",
        metadata: {
          name: "daily-backup",
          namespace: options.namespace,
        },
        spec: {
          cron: "0 0 * * *",
          task: "backup",
          retain: 30,
          groups: ["default"],
          concurrency: 3,
        },
      },
    });

    new Manifest(this, "longhorn-crypto-storage-class", {
      provider: kubernetes,
      manifest: {
        kind: "StorageClass",
        apiVersion: "storage.k8s.io/v1",
        metadata: {
          name: "longhorn-crypto",
        },
        provisioner: "driver.longhorn.io",
        allowVolumeExpansion: true,
        parameters: {
          numberOfReplicas: "3",
          staleReplicaTimeout: "2880", // 48 hours in minutes
          encrypted: "true",
          "csi.storage.k8s.io/provisioner-secret-name": "longhorn-encryption",
          "csi.storage.k8s.io/provisioner-secret-namespace": options.namespace,
          "csi.storage.k8s.io/node-publish-secret-name": "longhorn-encryption",
          "csi.storage.k8s.io/node-publish-secret-namespace": options.namespace,
          "csi.storage.k8s.io/node-stage-secret-name": "longhorn-encryption",
          "csi.storage.k8s.io/node-stage-secret-namespace": options.namespace,
        },
      },
    });
  }
}
