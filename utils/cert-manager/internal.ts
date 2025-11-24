import { Construct } from "constructs";
import { Certificate, CertificateOptions } from "./base";

/**
 * Private TLS certificate issued by the internal cluster CA.
 *
 * This subclass automatically injects:
 *
 *   issuerRef:
 *     name: "cluster-issuer"
 *     kind: "ClusterIssuer"
 *
 * Use this for:
 * - Internal service-to-service TLS (HTTP, gRPC, Webhooks)
 * - mTLS server certificates
 * - mTLS client certificates
 * - Internal wildcard certificates
 * - Databases, queues, operators, controllers, etc.
 *
 * Users of this class should NOT specify issuerRef manually.
 */
export class PrivateCertificate extends Certificate {
  constructor(
    scope: Construct,
    id: string,
    opts: Omit<CertificateOptions, "issuerRef">,
  ) {
    super(scope, id, {
      ...opts,
      issuerRef: {
        name: "cluster-issuer", // internal CA
        kind: "ClusterIssuer",
      },
    });
  }
}
