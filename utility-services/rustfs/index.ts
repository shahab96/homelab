import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { PublicIngressRoute, OnePasswordSecret } from "../../utils";
import { pool } from "./pool";

type RustFSOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;
};

export class RustFS extends Construct {
  constructor(scope: Construct, id: string, options: RustFSOptions) {
    super(scope, id);

    const { provider, namespace, name } = options;

    new OnePasswordSecret(this, "credentials", {
      provider,
      name: "rustfs-credentials",
      namespace,
      itemPath: "vaults/Lab/items/rustfs-credentials",
    });

    new Manifest(this, "rustfs-tenant", {
      provider,
      manifest: {
        apiVersion: "rustfs.com/v1alpha1",
        kind: "Tenant",
        metadata: {
          name,
          namespace,
        },
        spec: {
          image: "rustfs/rustfs:latest",
          credsSecret: {
            name: "rustfs-credentials",
          },
          tls: {
            mode: "certManager",
            mountPath: "/var/run/rustfs/tls",
            rotationStrategy: "Rollout",
            requireSanMatch: true,
            enableInternodeHttps: true,
            certManager: {
              manageCertificate: true,
              secretName: "rustfs-tenant-tls",
              issuerRef: {
                group: "cert-manager.io",
                kind: "ClusterIssuer",
                name: "cluster-issuer",
              },
              dnsNames: [
                "rustfs-tenant-console.homelab.svc",
                "rustfs-tenant-console.homelab.svc.cluster.local",
              ],
              includeGeneratedDnsNames: true,
            },
          },
          env: [{
            name: "RUSTFS_IDENTITY_OPENID_ENABLE",
            value: "on",
          }, {
            name: "RUSTFS_IDENTITY_OPENID_CONFIG_URL",
            value: "https://auth.dogar.dev/application/o/rust-fs/.well-known/openid-configuration"
          }, {
            name: "RUSTFS_IDENTITY_OPENID_CLIENT_ID",
            valueFrom: {
              secretKeyRef: {
                name: "rustfs-credentials",
                key: "client_id"
              },
            },
          }, {
            name: "RUSTFS_IDENTITY_OPENID_CLIENT_SECRET",
            valueFrom: {
              secretKeyRef: {
                name: "rustfs-credentials",
                key: "client_secret",
              },
            },
          }, {
            name: "RUSTFS_IDENTITY_OPENID_SCOPES",
            value: "openid,profile,email"
          }, {
            name: "RUSTFS_IDENTITY_OPENID_GROUPS_CLAIM",
            value: "groups",
          }, {
            name: "RUSTFS_IDENTITY_OPENID_USERNAME_CLAIM",
            value: "preferred_username"
          }, {
            name: "RUSTFS_IDENTITY_OPENID_DISPLAY_NAME",
            value: "Authentik"
          }, {
            name: "RUSTFS_CONSOLE_CORS_ALLOWED_ORIGINS",
            value: "https://blob.dogar.dev"
          }, {
            name: "RUSTFS_OBJECT_LOCK_ACQUIRE_TIMEOUT",
            value: "30",
          }, {
            name: "RUSTFS_LOCK_ACQUIRE_TIMEOUT",
            value: "30",
          }, {
            name: "RUSTFS_OBJECT_DEADLOCK_DETECTION_ENABLE",
            value: "true",
          }, {
            name: "RUSTFS_OBJECT_LOCK_DIAG_ENABLE",
            value: "true",
          }],
          pools: [
            pool({ name: "primary", servers: 2, storage: "100Gi", volumesPerServer: 2 }),
          ],
        },
      },
    });

    new PublicIngressRoute(this, "ingress", {
      provider,
      name: `${name}-public`,
      namespace,
      host: "blob.dogar.dev",
      serviceName: `rustfs-tenant-console`,
      servicePort: 9001,
      serviceProtocol: "https",
      skipBackendCertificate: true,
      sticky: true,
    });
  }
}
