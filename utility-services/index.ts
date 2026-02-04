import { DataKubernetesNamespaceV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-namespace-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { DataTerraformRemoteStateS3, TerraformStack } from "cdktf";
import { Construct } from "constructs";

import { GiteaRunner, GiteaServer } from "./gitea";
import { AuthentikServer } from "./authentik";
import { PostgresCluster } from "./postgres";
import { DynamicDNS } from "./dynamic-dns";
import { PublicIngressRoute } from "../utils";

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

    const r2Endpoint = `${process.env.ACCOUNT_ID!}.r2.cloudflarestorage.com`;

    const coreServicesState = new DataTerraformRemoteStateS3(
      this,
      "core-services-state",
      {
        usePathStyle: true,
        skipRegionValidation: true,
        skipCredentialsValidation: true,
        skipRequestingAccountId: true,
        skipS3Checksum: true,
        encrypt: true,
        bucket: "terraform-state",
        key: "core-services/terraform.tfstate",
        endpoints: {
          s3: `https://${r2Endpoint}`,
        },
        region: "auto",
        accessKey: process.env.ACCESS_KEY,
        secretKey: process.env.SECRET_KEY,
      },
    );

    const namespaceName = coreServicesState.getString("namespace-output");
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

    new DynamicDNS(this, "dynamic-dns", {
      provider: kubernetes,
      namespace,
      name: "cloudflare-ddns",
      records: [
        "dogar.dev",
        "auth.dogar.dev",
        "git.dogar.dev",
        "nix.dogar.dev",
        "pip.dogar.dev",
        "npm.dogar.dev",
        "go.dogar.dev",
        "elastic.dogar.dev",
        "kibana.dogar.dev",
      ],
    });

    const postgres = new PostgresCluster(this, "postgres-cluster", {
      certManagerApiVersion: "cert-manager.io/v1",
      name: "postgres-cluster",
      namespace,
      provider: kubernetes,
      users: ["shahab", "budget-tracker", "authentik", "gitea", "netbird"],
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

    new GiteaRunner(this, "gitea-runner", {
      provider: kubernetes,
      namespace,
      name: "gitea-runner",
      replicas: 3,
    });

    new PublicIngressRoute(this, "elasticsearch", {
      provider: kubernetes,
      namespace: "elastic-system",
      name: "elasticsearch",
      host: "elastic.dogar.dev",
      serviceName: "elasticsearch-es-http",
      servicePort: 9200,
      serviceProtocol: "https",
    });

    new PublicIngressRoute(this, "kibana", {
      provider: kubernetes,
      namespace: "elastic-system",
      name: "kibana",
      host: "kibana.dogar.dev",
      serviceName: "kibana-kb-http",
      servicePort: 5601,
      serviceProtocol: "https",
    });
  }
}
