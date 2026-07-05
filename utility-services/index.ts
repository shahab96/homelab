import { DataKubernetesNamespaceV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-namespace-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { DataTerraformRemoteStateS3, TerraformStack } from "cdktf";
import { Construct } from "constructs";

import { ForgejoServer, ForgejoRunner } from "./forgejo";
import { AuthentikServer } from "./authentik";
import { PostgresCluster } from "./postgres";
import { DynamicDNS } from "./dynamic-dns";
import { RustFS } from "./rustfs";
import { OnePasswordSecret } from "../utils";

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
        bucket: process.env.S3_BUCKET!,
        key: "core-services/terraform.tfstate",
        region: "auto",
        endpoints: {
          s3: process.env.S3_ENDPOINT,
        },
        accessKey: process.env.S3_ACCESS_KEY,
        secretKey: process.env.S3_SECRET_KEY,
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
        "pkgs.dogar.dev",
        "pos.omf.dogar.dev",
        "blob.dogar.dev",
        "docker.dogar.dev",
      ],
    });

    new OnePasswordSecret(this, "backups-secret", {
      namespace: "longhorn-system",
      provider: kubernetes,
      name: "digital-ocean-spaces",
      itemPath: "vaults/Lab/items/digital-ocean-spaces",
    });

    const postgres = new PostgresCluster(this, "postgres-cluster", {
      certManagerApiVersion: "cert-manager.io/v1",
      name: "postgres-cluster",
      namespace,
      provider: kubernetes,
      users: ["shahab", "budget-tracker", "authentik", "gitea", "forgejo", "netbird", "package-proxy"],
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

    const rustfs = new RustFS(this, "rustfs-tenant", {
      provider: kubernetes,
      name: "rustfs-tenant",
      namespace: "homelab",
    });

    const forgejo = new ForgejoServer(this, "forgejo-server", {
      provider: kubernetes,
      namespace,
      name: "forgejo",
    });

    forgejo.node.addDependency(authentik);
    forgejo.node.addDependency(rustfs);

    const forgejoRunner = new ForgejoRunner(this, "forgejo-runner", {
      provider: kubernetes,
      namespace,
      name: "forgejo-runner",
      replicas: 1,
      runnerUuid: "d23d6d11-cd39-486c-8078-7ce671902933",
    });

    forgejoRunner.node.addDependency(forgejo);
  }
}
