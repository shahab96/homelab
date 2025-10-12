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
  backupR2EndpointURL: string;
};

export class PostgresCluster extends Construct {
  constructor(scope: Construct, id: string, options: PostgresClusterOptions) {
    super(scope, id);

    const { kubernetes, helm } = options.providers;

    new Release(this, "cnpg-operator", {
      provider: helm,
      repository: "https://cloudnative-pg.github.io/charts",
      chart: "cloudnative-pg",
      name: "postgres-system",
      namespace: "cnpg-system",
    });

    const destinationPath = "s3://homelab/";
    const endpointURL = options.backupR2EndpointURL;
    const barmanStoreName = "r2-postgres-backup-store";

    const barmanConfiguration = {
      destinationPath,
      endpointURL,
      s3Credentials: {
        accessKeyId: {
          name: "cloudflare-token",
          key: "access_key_id",
        },
        secretAccessKey: {
          name: "cloudflare-token",
          key: "secret_access_key",
        },
      },
    };

    new Manifest(this, "r2-backup-store", {
      provider: kubernetes,
      manifest: {
        apiVersion: "barmancloud.cnpg.io/v1",
        kind: "ObjectStore",
        metadata: {
          namespace: options.namespace,
          name: barmanStoreName,
        },
        spec: {
          configuration: {
            ...barmanConfiguration,
            wal: {
              compression: "gzip",
            },
          },
        },
      },
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
            "postgres-cluster-rw",
            "postgres-cluster-rw.homelab.svc.cluster.local",
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
      fieldManager: { forceConflicts: true },
      manifest: {
        apiVersion: "postgresql.cnpg.io/v1",
        kind: "Cluster",
        metadata: {
          name: options.name,
          namespace: options.namespace,
        },
        spec: {
          instances: 3,
          minSyncReplicas: 1,
          maxSyncReplicas: 2,
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
          plugins: [
            {
              name: "barman-cloud.cloudnative-pg.io",
              enabled: true,
              isWALArchiver: true,
              parameters: {
                barmanObjectName: barmanStoreName,
              },
            },
          ],
          enableSuperuserAccess: false,
          bootstrap: {
            recovery: {
              source: "clusterBackup",
              database: "postgres",
              owner: options.primaryUser,
              secret: {
                name: options.initSecretName,
              },
            },
          },
          externalClusters: [
            {
              name: "clusterBackup",
              plugin: {
                name: "barman-cloud.cloudnative-pg.io",
                parameters: {
                  barmanObjectName: "r2-postgres-backup-store",
                  serverName: "postgres-cluster",
                },
              },
            },
          ],
          managed: {
            services: {
              disabledDefaultServices: ["ro", "r"],
              additional: [
                {
                  selectorType: "rw",
                  serviceTemplate: {
                    metadata: {
                      name: "postgres-cluster",
                      annotations: {
                        "external-dns.alpha.kubernetes.io/hostname":
                          "postgres.dogar.dev",
                      },
                    },
                    spec: {
                      type: "LoadBalancer",
                    },
                  },
                },
              ],
            },
          },
          storage: {
            size: "10Gi",
            storageClass: options.storageClass,
          },
          walStorage: {
            size: "1Gi",
            storageClass: options.storageClass,
          },
        },
      },
    });
  }
}
