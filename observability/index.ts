import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { OnePasswordSecret } from "../utils";
import { Prometheus } from "./prometheus";
import { Loki } from "./loki";
import { Tempo } from "./tempo";
import { OtelCollector } from "./otel-collector";

export class Observability extends TerraformStack {
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

    const prometheus = new Prometheus(this, "prometheus", {
      provider: helm,
      namespace: "monitoring",
      name: "prometheus-operator",
      version: "75.10.0",
    });

    new OnePasswordSecret(this, "rustfs-credentials", {
      provider: kubernetes,
      name: "rustfs-credentials",
      namespace: "monitoring",
      itemPath: "vaults/Lab/items/rustfs-credentials",
      dependsOn: [prometheus.release],
    });

    new Loki(this, "loki", {
      provider: helm,
      name: "loki",
      namespace: "monitoring",
      version: "7.3.0",
      dependsOn: [prometheus.release],
    });

    new Tempo(this, "tempo", {
      provider: helm,
      name: "tempo",
      namespace: "monitoring",
      version: "1.24.4",
      dependsOn: [prometheus.release],
    });

    new OtelCollector(this, "otel-collector", {
      provider: kubernetes,
      namespace: "monitoring",
      name: "otel-collector",
    });
  }
}
