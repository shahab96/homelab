import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Construct } from "constructs";
import { OnePasswordSecret } from "../../utils";

type PublicIssuerOptions = {
  provider: KubernetesProvider;
  apiVersion: string;
  namespace: string;
  server: string;
};

export class PublicIssuer extends Construct {
  constructor(scope: Construct, id: string, options: PublicIssuerOptions) {
    super(scope, id);

    const { apiVersion, provider, namespace, server } = options;

    new OnePasswordSecret(this, "cloudflare-token", {
      provider,
      namespace,
      name: "public-issuer-cloudflare-token",
      itemPath: "vaults/Lab/items/cloudflare",
    });

    // Cloudflare ACME ClusterIssuer
    new Manifest(this, "cloudflare-issuer", {
      provider,
      manifest: {
        apiVersion,
        kind: "ClusterIssuer",
        metadata: {
          name: "cloudflare-issuer",
        },
        spec: {
          acme: {
            email: "shahab@dogar.dev",
            server,
            privateKeySecretRef: {
              name: "cloudflare-cluster-issuer-account-key",
            },
            solvers: [
              {
                dns01: {
                  cloudflare: {
                    apiTokenSecretRef: {
                      name: "public-issuer-cloudflare-token",
                      key: "token",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });
  }
}
