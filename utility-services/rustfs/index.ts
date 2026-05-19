import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { PublicIngressRoute, OnePasswordSecret } from "../../utils";

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
          }],
          pools: [{
            name: "primary",
            servers: 2,
            persistence: {
              labels: {
                "recurring-job.longhorn.io/daily-backup": "enabled",
                "recurring-job.longhorn.io/source": "enabled",
              },
              volumesPerServer: 2,
              volumeClaimTemplate: {
                accessModes: ["ReadWriteOnce"],
                storageClassName: "longhorn",
                resources: {
                  requests: {
                    storage: "10Gi",
                  },
                },
              },
            },
          }],
        },
      },
    });

    new PublicIngressRoute(this, "ingress", {
      provider,
      name,
      namespace,
      host: "blob.dogar.dev",
      serviceName: `rustfs-tenant-console`,
      servicePort: 9001,
      sticky: true,
    });
  }
}
