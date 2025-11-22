import * as path from "path";
import { DataKubernetesNamespaceV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-namespace-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { DataTerraformRemoteStateLocal, TerraformStack } from "cdktf";
import { Construct } from "constructs";

import { ValkeyCluster } from "./valkey";
import { GiteaServer } from "./gitea";
import { AuthentikServer } from "./authentik";
import { PostgresCluster } from "./postgres";

export class UtilityServices extends TerraformStack {
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

    const homelabState = new DataTerraformRemoteStateLocal(
      this,
      "homelab-state",
      {
        path: path.join(
          __dirname,
          "../cdktf.out/stacks/homelab/terraform.tfstate",
        ),
      },
    );

    const namespaceName = homelabState.getString("namespace-output");
    const namespaceResource = new DataKubernetesNamespaceV1(
      this,
      "homelab-namespace",
      {
        provider: kubernetes,
        metadata: {
          name: namespaceName,
        },
      },
    );
    const namespace = namespaceResource.metadata.name;

    const r2Endpoint = `${process.env.ACCOUNT_ID!}.r2.cloudflarestorage.com`;

    const valkeyCluster = new ValkeyCluster(this, "valkey-cluster", {
      namespace,
      provider: kubernetes,
      name: "valkey",
    });

    const postgres = new PostgresCluster(this, "postgres-cluster", {
      certManagerApiVersion: "cert-manager.io/v1",
      name: "postgres-cluster",
      namespace,
      provider: kubernetes,
      users: ["shahab", "budget-tracker", "authentik", "gitea"],
      primaryUser: "shahab",
      initSecretName: "postgres-password",
      backupR2EndpointURL: `https://${r2Endpoint}`,
    });

    const authentik = new AuthentikServer(this, "authentik-server", {
      providers: {
        helm,
        kubernetes,
      },
      name: "authentik",
      namespace,
    });

    authentik.node.addDependency(valkeyCluster);
    authentik.node.addDependency(postgres);

    const gitea = new GiteaServer(this, "gitea-server", {
      providers: {
        helm,
        kubernetes,
      },
      name: "gitea",
      namespace,
      r2Endpoint: r2Endpoint,
    });

    gitea.node.addDependency(authentik);
  }
}
