import * as fs from "fs";
import * as path from "path";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";

type CertManagerOptions = {
  providers: {
    kubernetes: KubernetesProvider;
    helm: HelmProvider;
  };
  version: string;
  name: string;
  namespace: string;
  certManagerApiVersion: string;
};

export class CertManager extends Construct {
  constructor(scope: Construct, id: string, options: CertManagerOptions) {
    super(scope, id);

    const { helm, kubernetes } = options.providers;
    const { certManagerApiVersion } = options;

    new Release(this, id, {
      provider: helm,
      name: options.name,
      namespace: options.namespace,
      version: options.version,
      repository: "https://charts.jetstack.io",
      chart: "cert-manager",
      createNamespace: true,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });

    // "apiVersion=v1,kind=Secret,namespace=default,name=sample"

    // Self-signed ClusterIssuer for initial CA
    new Manifest(this, "ca-issuer", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "ClusterIssuer",
        metadata: {
          name: "ca-issuer",
        },
        spec: {
          selfSigned: {},
        },
      },
    }).importFrom(
      `apiVersion=${certManagerApiVersion},kind=ClusterIssuer,name=ca-issuer`,
    );

    // Self-signed CA Certificate
    new Manifest(this, "selfsigned-ca", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "Certificate",
        metadata: {
          name: "selfsigned-ca",
          namespace: options.namespace,
        },
        spec: {
          isCA: true,
          commonName: "Shahab Dogar",
          secretName: "root-secret",
          privateKey: {
            algorithm: "ECDSA",
            size: 256,
          },
          issuerRef: {
            name: "ca-issuer",
            kind: "ClusterIssuer",
            group: "cert-manager.io",
          },
        },
      },
    }).importFrom(
      `apiVersion=${certManagerApiVersion},kind=Certificate,name=selfsigned-ca,namespace=${options.namespace}`,
    );

    // CA-based ClusterIssuer
    new Manifest(this, "cluster-issuer", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "ClusterIssuer",
        metadata: {
          name: "cluster-issuer",
        },
        spec: {
          ca: {
            secretName: "root-secret",
          },
        },
      },
    }).importFrom(
      `apiVersion=${certManagerApiVersion},kind=ClusterIssuer,name=cluster-issuer`,
    );

    // Cloudflare ACME ClusterIssuer
    new Manifest(this, "cloudflare-issuer", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "ClusterIssuer",
        metadata: {
          name: "cloudflare-issuer",
        },
        spec: {
          acme: {
            email: "shahab@dogar.dev",
            server: "https://acme-v02.api.letsencrypt.org/directory",
            privateKeySecretRef: {
              name: "cloudflare-cluster-issuer-account-key",
            },
            solvers: [
              {
                dns01: {
                  cloudflare: {
                    apiTokenSecretRef: {
                      name: "cloudflare-token",
                      key: "token",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    }).importFrom(
      `apiVersion=${certManagerApiVersion},kind=ClusterIssuer,name=cloudflare-issuer`,
    );
  }
}
