import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

type CertificateOptions = {
  provider: KubernetesProvider;

  /** Namespace to create the Certificate in */
  namespace: string;

  /** Required name of the certificate (and CRD name) */
  name: string;

  /** Secret name for storing the issued TLS cert */
  secretName: string;

  /** One or more DNS names the certificate should cover */
  dnsNames: string[];

  /** Reference to the cert-manager issuer */
  issuerRef: {
    name: string;
    kind?: string; // ClusterIssuer or Issuer
  };

  /** Optional duration (default: cert-manager default) */
  duration?: string;

  /** Optional renewBefore (default: cert-manager default) */
  renewBefore?: string;
};

class Certificate extends Construct {
  public readonly manifest: Manifest;

  constructor(scope: Construct, id: string, opts: CertificateOptions) {
    super(scope, id);

    const manifest: any = {
      apiVersion: "cert-manager.io/v1",
      kind: "Certificate",
      metadata: {
        name: opts.name,
        namespace: opts.namespace,
      },
      spec: {
        secretName: opts.secretName,
        dnsNames: opts.dnsNames,
        issuerRef: {
          name: opts.issuerRef.name,
          kind: opts.issuerRef.kind ?? "ClusterIssuer",
        },
      },
    };

    if (opts.duration) {
      manifest.spec.duration = opts.duration;
    }

    if (opts.renewBefore) {
      manifest.spec.renewBefore = opts.renewBefore;
    }

    this.manifest = new Manifest(this, id, {
      provider: opts.provider,
      manifest,
    });
  }
}

export class CloudflareCertificate extends Certificate {
  constructor(
    scope: Construct,
    id: string,
    opts: Omit<CertificateOptions, "issuerRef">,
  ) {
    super(scope, id, {
      ...opts,
      issuerRef: {
        name: "cloudflare-issuer",
        kind: "ClusterIssuer",
      },
    });
  }
}
