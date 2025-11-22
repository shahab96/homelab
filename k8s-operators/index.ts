import * as fs from "fs";
import * as path from "path";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { BarmanCloudPluginInstall } from "./barman";
import { Prometheus } from "./prometheus";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

export class K8SOperators extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const helm = new HelmProvider(this, "helm", {
      kubernetes: {
        configPath: "~/.kube/config",
      },
    });

    const kubernetes = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
    });

    new Prometheus(this, "prometheus", {
      providers: {
        helm,
        kubernetes,
      },
      namespace: "monitoring",
      name: "prometheus-operator",
      version: "75.10.0",
    });

    new Release(this, "onepassword-operator", {
      provider: helm,
      name: "onepassword-operator",
      chart: "connect",
      repository: "https://1password.github.io/connect-helm-charts/",
      namespace: "1password",
      createNamespace: true,
      set: [
        {
          name: "operator.create",
          value: "true",
        },
      ],
      setSensitive: [
        {
          name: "operator.token.value",
          value: process.env.OP_CONNECT_TOKEN!,
        },
        {
          name: "connect.credentials_base64",
          value: btoa(
            fs.readFileSync(
              path.join(__dirname, "1password-credentials.json"),
              "utf-8",
            ),
          ),
        },
      ],
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
  }
}
