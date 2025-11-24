import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Construct } from "constructs";

type PrivateIssuerOptions = {
  provider: KubernetesProvider;
  namespace: string;
  apiVersion: string;
  commonName: string;
  secretName: string;
  privateKey: {
    algorithm: "RSA" | "ECDSA" | "Ed25519";
    size: number;
  };
};

export class PrivateIssuer extends Construct {
  constructor(scope: Construct, id: string, options: PrivateIssuerOptions) {
    super(scope, id);

    const {
      provider,
      namespace,
      commonName,
      privateKey,
      secretName,
      apiVersion,
    } = options;

    // Self-signed ClusterIssuer for initial CA
    new Manifest(this, "ca-issuer", {
      provider,
      manifest: {
        apiVersion,
        kind: "ClusterIssuer",
        metadata: {
          name: "ca-issuer",
        },
        spec: {
          selfSigned: {},
        },
      },
    });

    // Self-signed CA Certificate
    new Manifest(this, "selfsigned-ca", {
      provider,
      manifest: {
        apiVersion,
        kind: "Certificate",
        metadata: {
          name: "selfsigned-ca",
          namespace,
        },
        spec: {
          isCA: true,
          commonName,
          secretName,
          privateKey,
          issuerRef: {
            name: "ca-issuer",
            kind: "ClusterIssuer",
            group: "cert-manager.io",
          },
        },
      },
    });

    // CA-based ClusterIssuer
    new Manifest(this, "cluster-issuer", {
      provider,
      manifest: {
        apiVersion,
        kind: "ClusterIssuer",
        metadata: {
          name: "cluster-issuer",
        },
        spec: {
          ca: {
            secretName,
          },
        },
      },
    });
  }
}
