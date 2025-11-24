import { DataKubernetesNamespaceV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-namespace-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { DataTerraformRemoteStateS3, TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { PrivateIssuer, PublicIssuer } from "./issuers";

export class PKI extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const kubernetes = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
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

    new PrivateIssuer(this, "private-issuer", {
      provider: kubernetes,
      namespace,
      apiVersion: "cert-manager.io/v1",
      secretName: "root-secret",
      commonName: "Homelab Root CA",
      privateKey: {
        algorithm: "Ed25519",
        size: 256,
      },
    });

    new PublicIssuer(this, "public-issuer", {
      provider: kubernetes,
      namespace,
      apiVersion: "cert-manager.io/v1",
      server: "https://acme-v02.api.letsencrypt.org/directory",
    });
  }
}
