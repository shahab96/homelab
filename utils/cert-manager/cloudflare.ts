import { Construct } from "constructs";
import { Certificate, CertificateOptions } from "./base";

/**
 * Public certificate issued via the Cloudflare ACME ClusterIssuer.
 *
 * This subclass automatically injects:
 *
 *   issuerRef:
 *     name: "cloudflare-issuer"
 *     kind: "ClusterIssuer"
 *
 * It is intended for generating publicly trusted HTTPS certificates
 * (e.g., *.dogar.dev) using Cloudflare DNS-01 validation.
 *
 * Users of this class should *not* specify issuerRef manually.
 */
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
