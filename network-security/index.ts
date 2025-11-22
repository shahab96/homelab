import { DataKubernetesNamespaceV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-namespace-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { DataTerraformRemoteStateS3, TerraformStack } from "cdktf";
import { Construct } from "constructs";

import {
  RateLimitMiddleware,
  IpAllowListMiddleware,
  IpAllowListMiddlewareTCP,
} from "./traefik";
import { ValkeyCluster } from "./valkey";
import { InternalIngressRoute } from "../utils";

export class NetworkSecurity extends TerraformStack {
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

    new ValkeyCluster(this, "valkey-cluster", {
      provider: kubernetes,
      name: "valkey",
      namespace,
    });

    new RateLimitMiddleware(this, "rate-limit", {
      provider: kubernetes,
      namespace,
      name: "rate-limit",
    });

    new IpAllowListMiddleware(this, "internal-ip-allow-list", {
      provider: kubernetes,
      namespace,
      name: "ip-allow-list",
      sourceRanges: ["192.168.18.0/24", "10.43.0.0/16"],
    });

    new IpAllowListMiddlewareTCP(this, "tcp-internal-ip-allow-list", {
      provider: kubernetes,
      namespace,
      name: "tcp-ip-allow-list",
      sourceRanges: ["192.168.18.0/24", "10.42.0.0/16"],
    });

    new InternalIngressRoute(this, "longhorn-ui", {
      provider: kubernetes,
      namespace: "longhorn-system",
      name: "longhorn-ui",
      host: "longhorn.dogar.dev",
      serviceName: "longhorn-frontend",
      servicePort: 80,
    });

    new InternalIngressRoute(this, "grafana-ui", {
      provider: kubernetes,
      namespace: "monitoring",
      name: "grafana-ui",
      host: "grafana.dogar.dev",
      serviceName: "prometheus-operator-grafana",
      servicePort: 80,
    });
  }
}
