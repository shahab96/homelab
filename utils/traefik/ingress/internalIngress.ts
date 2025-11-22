import { Construct } from "constructs";
import { IngressRoute, IngressRouteOptions } from "./ingress";
import { DataTerraformRemoteStateS3 } from "cdktf";
import { DataKubernetesNamespaceV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-namespace-v1";

type InternalIngressRouteOptions = Omit<
  IngressRouteOptions,
  "entryPoints" | "tlsSecretName" | "middlewares"
>;

export class InternalIngressRoute extends Construct {
  constructor(scope: Construct, id: string, opts: InternalIngressRouteOptions) {
    super(scope, id);

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
      "core-services-namespace",
      {
        provider: opts.provider,
        metadata: {
          name: namespaceName,
        },
      },
    );
    const namespace = namespaceResource.metadata.name;

    new IngressRoute(this, opts.name, {
      provider: opts.provider,
      namespace: opts.namespace,
      host: opts.host,
      path: opts.path ?? "/",
      serviceName: opts.serviceName,
      servicePort: opts.servicePort,
      entryPoints: ["websecure"],
      tlsSecretName: `${opts.name}-tls`,
      middlewares: [`${namespace}/ip-allow-list`],
      name: opts.name,
    });
  }
}
