import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Construct } from "constructs";

type PrivateIssuerOptions = {
  provider: KubernetesProvider;
  namespace: string;
  apiVersion: string;
  commonName: string;
  rootSecretName: string;
  intermediateSecretName: string;
};

export class PrivateIssuer extends Construct {
  constructor(scope: Construct, id: string, options: PrivateIssuerOptions) {
    super(scope, id);

    const {
      provider,
      namespace,
      apiVersion,
      commonName,
      rootSecretName,
      intermediateSecretName,
    } = options;

    //
    // 1. Root CA (self-signed)
    //
    new Manifest(this, "root-ca-issuer", {
      provider,
      manifest: {
        apiVersion,
        kind: "ClusterIssuer",
        metadata: { name: "root-ca-selfsigned" },
        spec: { selfSigned: {} },
      },
    });

    new Manifest(this, "root-ca", {
      provider,
      manifest: {
        apiVersion,
        kind: "Certificate",
        metadata: { name: "root-ca", namespace },
        spec: {
          isCA: true,
          commonName: `${commonName} Root CA`,
          secretName: rootSecretName,
          privateKey: {
            algorithm: "RSA",
            size: 4096,
          },
          issuerRef: {
            name: "root-ca-selfsigned",
            kind: "ClusterIssuer",
            group: "cert-manager.io",
          },
        },
      },
    });

    //
    // 2. Intermediate CA (signed by root CA)
    //
    new Manifest(this, "intermediate-ca-issuer", {
      provider,
      manifest: {
        apiVersion,
        kind: "ClusterIssuer",
        metadata: { name: "root-ca-signer" },
        spec: {
          ca: { secretName: rootSecretName },
        },
      },
    });

    new Manifest(this, "intermediate-ca", {
      provider,
      manifest: {
        apiVersion,
        kind: "Certificate",
        metadata: { name: "intermediate-ca", namespace },
        spec: {
          isCA: true,
          commonName: `${commonName} Intermediate CA`,
          secretName: intermediateSecretName,
          privateKey: {
            algorithm: "ECDSA",
            size: 384,
          },
          issuerRef: {
            name: "root-ca-signer",
            kind: "ClusterIssuer",
            group: "cert-manager.io",
          },
        },
      },
    });

    //
    // 3. Final public cluster issuer (used by your apps)
    //
    new Manifest(this, "cluster-issuer", {
      provider,
      manifest: {
        apiVersion,
        kind: "ClusterIssuer",
        metadata: { name: "cluster-issuer" },
        spec: {
          ca: { secretName: intermediateSecretName },
        },
      },
    });
  }
}
