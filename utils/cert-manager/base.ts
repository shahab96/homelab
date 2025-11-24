import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

/**
 * Options passed to the Certificate construct for generating
 * cert-manager.io/v1 Certificate resources.
 *
 * This type supports both public certificates (Cloudflare/ACME)
 * and private internal certificates (internal CA), making it usable
 * across all cluster security contexts (Ingress TLS, internal mTLS, etc.).
 */
export type CertificateOptions = {
  /**
   * Kubernetes provider instance used by the underlying Manifest resource.
   *
   * This should typically be the cluster's primary Kubernetes provider.
   *
   * Required.
   */
  provider: KubernetesProvider;

  /**
   * Kubernetes namespace where the Certificate resource and the
   * corresponding Secret will be created.
   *
   * Required.
   */
  namespace: string;

  /**
   * Name of the Certificate resource (metadata.name).
   *
   * This should be unique within the namespace.
   *
   * Required.
   */
  name: string;

  /**
   * Name of the Kubernetes Secret that cert-manager will populate with
   * `tls.crt`, `tls.key`, and optionally `ca.crt`.
   *
   * This secret is automatically created and updated by cert-manager.
   *
   * Required.
   */
  secretName: string;

  /**
   * List of DNS Subject Alternative Names that the certificate must cover.
   *
   * cert-manager requires at least one entry.
   *
   * For internal certificates: service FQDNs (svc.cluster.local).
   * For public certificates: external domain names.
   *
   * Required.
   */
  dnsNames: string[];

  /**
   * Reference to the cert-manager Issuer or ClusterIssuer used to sign the certificate.
   *
   * - For public certs: Cloudflare ACME ClusterIssuer
   * - For private certs: Internal CA ClusterIssuer
   *
   * This field is usually injected automatically by subclasses
   * (e.g., PublicCertificate / PrivateCertificate).
   *
   * Required internally — not intended to be set by user code directly.
   */
  issuerRef?: {
    /**
     * Name of the Issuer or ClusterIssuer.
     */
    name: string;

    /**
     * Type of issuer ("Issuer" or "ClusterIssuer").
     *
     * Defaults to "ClusterIssuer" when omitted.
     */
    kind?: string;
  };

  /**
   * The certificate's validity duration (e.g. "2160h" for 90 days).
   *
   * If omitted, cert-manager applies its own default (90 days for ACME).
   *
   * Optional.
   */
  duration?: string;

  /**
   * How long before expiry cert-manager should attempt early renewal.
   *
   * Example: "360h" (15 days before expiration).
   *
   * Optional.
   */
  renewBefore?: string;

  /**
   * Optional Common Name for the certificate's subject.
   *
   * SAN-only certificates are recommended, but CN is still required for
   * compatibility with some older libraries (Java, ClickHouse, OpenSSL tooling).
   *
   * Optional.
   */
  commonName?: string;

  /**
   * Key Usage extension — determines what the certificate may be used for.
   *
   * Common values:
   *
   * - "digital signature"
   * - "key encipherment"
   * - "server auth"
   * - "client auth"
   *
   * Example for mTLS server certificates:
   * usages: ["digital signature", "key encipherment", "server auth"]
   *
   * Example for mTLS client certificates:
   * usages: ["digital signature", "client auth"]
   *
   * Optional — cert-manager applies sensible defaults when omitted.
   */
  usages?: string[];

  /**
   * Options controlling the generated private key.
   *
   * Useful for:
   * - Choosing RSA vs ECDSA vs Ed25519
   * - Increasing RSA key strength (2048 → 4096)
   * - Optimizing performance for internal services (ECDSA P-256)
   *
   * Optional.
   */
  privateKey?: {
    /**
     * Private key algorithm.
     *
     * - "RSA"     (default)
     * - "ECDSA"   (great for internal TLS)
     * - "Ed25519" (fast and modern, but not universally supported)
     *
     * Optional.
     */
    algorithm?: "RSA" | "ECDSA" | "Ed25519";

    /**
     * Key size in bits.
     *
     * Only applies to algorithms that support length:
     * - RSA: 2048, 3072, 4096
     * - ECDSA: 256, 384
     *
     * Optional.
     */
    size?: number;
  };

  /**
   * IP address SAN entries (rarely needed, but sometimes required
   * for services bound directly to cluster node IPs or StatefulSet pod IPs).
   *
   * Using IP SANs is generally discouraged unless explicitly required.
   *
   * Optional.
   */
  ipAddresses?: string[];

  /**
   * Subject information for the certificate (Organization, OrgUnit, etc.)
   *
   * Example:
   *
   * subject: {
   *   organizations: ["Internal Systems"],
   *   organizationalUnits: ["Platform"]
   * }
   *
   * Optional.
   */
  subject?: {
    organizations?: string[];
    organizationalUnits?: string[];
    countries?: string[];
    provinces?: string[];
    localities?: string[];
    streetAddresses?: string[];
    postalCodes?: string[];
  };
};

export class Certificate extends Construct {
  /** The underlying Kubernetes manifest */
  public readonly manifest: Manifest;

  constructor(scope: Construct, id: string, opts: CertificateOptions) {
    super(scope, id);

    // --- Validation ---------------------------------------------------------
    if (!opts.issuerRef) {
      throw new Error(
        `Certificate '${opts.name}' must specify issuerRef (usually provided by a subclass).`,
      );
    }
    if (!opts.dnsNames || opts.dnsNames.length === 0) {
      throw new Error(
        `Certificate '${opts.name}' must include at least one DNS name in dnsNames[].`,
      );
    }

    // --- Base manifest ------------------------------------------------------
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

    // --- Optional: duration & renewBefore ---------------------------------
    if (opts.duration) {
      manifest.spec.duration = opts.duration;
    }

    if (opts.renewBefore) {
      manifest.spec.renewBefore = opts.renewBefore;
    }

    // --- Optional: commonName ----------------------------------------------
    if (opts.commonName) {
      manifest.spec.commonName = opts.commonName;
    }

    // --- Optional: key usages ----------------------------------------------
    if (opts.usages?.length) {
      manifest.spec.usages = opts.usages;
    }

    // --- Optional: private key settings ------------------------------------
    if (opts.privateKey) {
      manifest.spec.privateKey = {
        ...opts.privateKey,
      };
    }

    // --- Optional: IP SAN entries ------------------------------------------
    if (opts.ipAddresses?.length) {
      manifest.spec.ipAddresses = opts.ipAddresses;
    }

    // --- Optional: subject fields ------------------------------------------
    if (opts.subject) {
      manifest.spec.subject = opts.subject;
    }

    // --- Create manifest resource ------------------------------------------
    this.manifest = new Manifest(this, id, {
      provider: opts.provider,
      manifest,
    });
  }
}
