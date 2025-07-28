import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Construct } from "constructs";

type PostgresClusterOptions = {
  providers: {
    kubernetes: KubernetesProvider;
    helm: HelmProvider;
  };
  name: string;
  namespace: string;
  storageClass: string;
  users: string[];
  primaryUser: string;
  initSecretName: string;
  certManagerApiVersion: string;
  version: string;
};

export class PostgresCluster extends Construct {
  constructor(scope: Construct, id: string, options: PostgresClusterOptions) {
    super(scope, id);

    const { kubernetes, helm } = options.providers;

    new Release(this, "cnpg-operator", {
      provider: helm,
      version: options.version,
      repository: "https://cloudnative-pg.github.io/charts",
      chart: "cloudnative-pg",
      name: "postgres-system",
      namespace: options.namespace,
    });

    const { certManagerApiVersion } = options;

    const certNames = {
      server: "postgres-server-cert",
      client: "postgres-client-cert",
    };

    const caNames = {
      server: "postgres-server-ca",
      client: "postgres-client-ca",
    };

    // Self-signed issuer for creating CA certificates
    new Manifest(this, "selfsigned-issuer", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "Issuer",
        metadata: {
          name: "selfsigned-issuer",
          namespace: options.namespace,
        },
        spec: {
          selfSigned: {},
        },
      },
    });

    // Server CA certificate
    new Manifest(this, "server-ca-cert", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "Certificate",
        metadata: {
          name: "server-ca",
          namespace: options.namespace,
        },
        spec: {
          isCA: true,
          commonName: caNames.server,
          secretName: caNames.server,
          privateKey: {
            algorithm: "ECDSA",
            size: 384,
          },
          duration: "52560h", // 6 years
          renewBefore: "8760h", // 1 year before expiration
          issuerRef: {
            name: "selfsigned-issuer",
            kind: "Issuer",
            group: "cert-manager.io",
          },
        },
      },
    });

    // Issuer using the server CA
    new Manifest(this, "server-ca-issuer", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "Issuer",
        metadata: {
          name: `${caNames.server}-issuer`,
          namespace: options.namespace,
        },
        spec: {
          ca: {
            secretName: caNames.server,
          },
        },
      },
    });

    // Secret for server certificate
    new Manifest(this, "server-ca-cert-secret", {
      provider: kubernetes,
      manifest: {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: certNames.server,
          namespace: options.namespace,
          labels: {
            "cnpg.io/reload": "",
          },
        },
      },
    });

    // Server certificate
    new Manifest(this, "server-cert", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "Certificate",
        metadata: {
          name: certNames.server,
          namespace: options.namespace,
        },
        spec: {
          secretName: certNames.server,
          usages: ["server auth"],
          dnsNames: [
            "postgres-cluster-rw.postgres-system.svc.cluster.local",
            "postgres-cluster-ro.postgres-system.svc.cluster.local",
            "postgres-cluster-r.postgres-system.svc.cluster.local",
            "postgres.dogar.dev",
          ],
          duration: "4380h", // 6 months
          renewBefore: "720h", // 30 days before expiration
          issuerRef: {
            name: `${caNames.server}-issuer`,
            kind: "Issuer",
            group: "cert-manager.io",
          },
        },
      },
    });

    // Client CA certificate
    new Manifest(this, "client-ca", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "Certificate",
        metadata: {
          name: "client-ca",
          namespace: options.namespace,
        },
        spec: {
          isCA: true,
          commonName: caNames.client,
          secretName: caNames.client,
          privateKey: {
            algorithm: "ECDSA",
            size: 256,
          },
          duration: "52560h", // 6 years
          renewBefore: "8760h", // 1 year before expiration
          issuerRef: {
            name: "selfsigned-issuer",
            kind: "Issuer",
            group: "cert-manager.io",
          },
        },
      },
    });

    // Issuer using the client CA
    new Manifest(this, "client-ca-issuer", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "Issuer",
        metadata: {
          name: `${caNames.client}-issuer`,
          namespace: options.namespace,
        },
        spec: {
          ca: {
            secretName: caNames.client,
          },
        },
      },
    });

    // Secret for client certificate
    new Manifest(this, `${certNames.client}-secret`, {
      provider: kubernetes,
      manifest: {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: certNames.client,
          namespace: options.namespace,
          labels: {
            "cnpg.io/reload": "",
          },
        },
      },
    });

    // Client certificate for streaming replica
    new Manifest(this, "streaming-replica-cert", {
      provider: kubernetes,
      manifest: {
        apiVersion: certManagerApiVersion,
        kind: "Certificate",
        metadata: {
          name: certNames.client,
          namespace: options.namespace,
        },
        spec: {
          secretName: certNames.client,
          usages: ["client auth"],
          commonName: "streaming_replica",
          duration: "4380h", // 6 months
          renewBefore: "720h", // 30 days before expiration
          issuerRef: {
            name: "postgres-client-ca-issuer",
            kind: "Issuer",
            group: "cert-manager.io",
          },
        },
      },
    });

    // Client certificates for users
    options.users.forEach(
      (user) =>
        new Manifest(this, `${user}-client-cert`, {
          provider: kubernetes,
          manifest: {
            apiVersion: certManagerApiVersion,
            kind: "Certificate",
            metadata: {
              name: `${user}-client-cert`,
              namespace: options.namespace,
            },
            spec: {
              secretName: `${user}-client-cert`,
              usages: ["client auth"],
              commonName: user,
              duration: "4380h", // 6 months
              renewBefore: "720h", // 30 days before expiration
              issuerRef: {
                name: "postgres-client-ca-issuer",
                kind: "Issuer",
                group: "cert-manager.io",
              },
            },
          },
        }),
    );

    new Manifest(this, "postgres-cluster", {
      provider: kubernetes,
      manifest: {
        apiVersion: "postgresql.cnpg.io/v1",
        kind: "Cluster",
        metadata: {
          name: options.name,
          namespace: options.namespace,
        },
        spec: {
          instances: 3,
          maxSyncReplicas: 0,
          primaryUpdateStrategy: "unsupervised",
          certificates: {
            serverCASecret: certNames.server,
            serverTLSSecret: certNames.server,
            clientCASecret: certNames.client,
            replicationTLSSecret: certNames.client,
          },
          postgresql: {
            pg_hba: [
              `hostssl all      ${options.primaryUser}   all          cert`,
              "hostssl sameuser all      all          cert",
            ],
          },
          enableSuperuserAccess: false,
          bootstrap: {
            initdb: {
              database: "postgres",
              secret: {
                name: options.initSecretName,
              },
              postInitSQL: [`CREATE USER ${options.primaryUser} SUPERUSER;`],
            },
          },
          storage: {
            size: "10Gi",
            storageClass: options.storageClass,
          },
          walStorage: {
            size: "10Gi",
            storageClass: options.storageClass,
          },
        },
      },
    });
  }
}
