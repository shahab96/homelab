import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { BarmanCloudPluginInstall } from "./barman";
import { Prometheus } from "./prometheus";
import { OnePassword } from "./1password";

export class K8SOperators extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const helm = new HelmProvider(this, "helm", {
      kubernetes: {
        configPath: "~/.kube/config",
      },
    });

    new Prometheus(this, "prometheus", {
      provider: helm,
      namespace: "monitoring",
      name: "prometheus-operator",
      version: "75.10.0",
    });

    new OnePassword(this, "onepassword", {
      provider: helm,
      name: "onepassword",
    });

    const cnpg = new Release(this, "cnpg-operator", {
      provider: helm,
      repository: "https://cloudnative-pg.github.io/charts",
      chart: "cloudnative-pg",
      name: "postgres-system",
      namespace: "cnpg-system",
      createNamespace: true,
    });

    const barman = new BarmanCloudPluginInstall(this, "barman-cloud-plugin", {
      url: "https://github.com/cloudnative-pg/plugin-barman-cloud/releases/download/v0.9.0/manifest.yaml",
    });

    barman.node.addDependency(cnpg);

    new Release(this, "elasticsearch", {
      provider: helm,
      repository: "https://helm.elastic.co",
      chart: "eck-operator",
      name: "elasticsearch",
      namespace: "elastic-system",
      createNamespace: true,
    });
  }
}
