import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Construct } from "constructs";
import { OnePasswordSecret } from "../../utils";

type PostgresClusterOptions = {
  provider: KubernetesProvider;
  name: string;
  namespace: string;
  users: string[];
  primaryUser: string;
  initSecretName: string;
  certManagerApiVersion: string;
  backupR2EndpointURL: string;
};

export class PostgresCluster extends Construct {
  constructor(scope: Construct, id: string, options: PostgresClusterOptions) {
    super(scope, id);

    const { provider } = options;

    const destinationPath = "s3://postgres-backups/";
    const endpointURL = options.backupR2EndpointURL;
    const barmanStoreName = "r2-postgres-backup-store";
    const backupServerName = `${options.name}-backup`;

    const barmanConfiguration = {
      destinationPath,
      endpointURL,
      s3Credentials: {
        accessKeyId: {
          name: "barman-cloudflare-token",
          key: "access_key_id",
        },
        secretAccessKey: {
          name: "barman-cloudflare-token",
          key: "secret_access_key",
        },
        region: {
          name: "barman-cloudflare-token",
          key: "AWS_REGION",
        },
      },
      wal: {
        compression: "gzip",
      },
      data: {
        compression: "gzip",
      },
    };

    new OnePasswordSecret(this, "barman-cloudflare-token", {
      provider: options.provider,
      name: "barman-cloudflare-token",
      namespace: options.namespace,
      itemPath: "vaults/Lab/items/cloudflare",
    });

    new Manifest(this, "r2-backup-store", {
      provider,
      manifest: {
        apiVersion: "barmancloud.cnpg.io/v1",
        kind: "ObjectStore",
        metadata: {
          namespace: options.namespace,
          name: barmanStoreName,
        },
        spec: {
          retentionPolicy: "15d",
          configuration: {
            ...barmanConfiguration,
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
      provider,
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
      provider,
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
      provider,
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

    // Server certificate
    new Manifest(this, "server-cert", {
      provider,
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
      provider,
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
      provider,
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
      provider,
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
      provider,
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
          provider,
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
      provider,
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
            parameters: {
              archive_mode: "on",
              archive_timeout: "60min",
              checkpoint_timeout: "10min",
              checkpoint_completion_target: "0.7",
              dynamic_shared_memory_type: "posix",
              full_page_writes: "on",
              log_destination: "csvlog",
              log_directory: "/controller/log",
              log_filename: "postgres",
              log_rotation_age: "0",
              log_rotation_size: "0",
              log_truncate_on_rotation: "false",
              logging_collector: "on",
              max_parallel_workers: "32",
              max_replication_slots: "32",
              max_worker_processes: "32",
              max_slot_wal_keep_size: "256MB",
              max_wal_size: "512MB",
              min_wal_size: "128MB",
              shared_memory_type: "mmap",
              shared_preload_libraries: "",
              ssl_max_protocol_version: "TLSv1.3",
              ssl_min_protocol_version: "TLSv1.3",
              wal_compression: "on",
              wal_keep_size: "128MB",
              wal_level: "replica",
              wal_log_hints: "on",
              wal_receiver_timeout: "5s",
              wal_sender_timeout: "5s",
            },
            pg_hba: [
              `hostssl all      ${options.primaryUser}   all          cert`,
              "hostssl sameuser all      all          cert",
            ],
          },
          plugins: [
            {
              name: "barman-cloud.cloudnative-pg.io",
              isWALArchiver: true,
              parameters: {
                barmanObjectName: barmanStoreName,
                serverName: backupServerName,
              },
            },
          ],
          bootstrap: {
            recovery: {
              source: "clusterBackup",
            },
          },
          externalClusters: [
            {
              name: "clusterBackup",
              plugin: {
                name: "barman-cloud.cloudnative-pg.io",
                parameters: {
                  barmanObjectName: barmanStoreName,
                  serverName: backupServerName,
                  skipWalArchiveCheck: true,
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
                      superuser: true,
                    },
                    spec: {
                      type: "LoadBalancer",
                    },
                  },
                },
              ],
            },
            roles: [
              {
                name: options.primaryUser,
                inRoles: ["postgres"],
                inherit: true,
                disablePassword: true,
                createdb: true,
                createrole: true,
                login: true,
                ensure: "present",
              },
            ],
          },
          storage: {
            size: "10Gi",
            storageClass: "longhorn",
          },
          walStorage: {
            size: "2Gi",
            storageClass: "longhorn",
          },
        },
      },
    });

    new Manifest(this, "postgres-backup-job", {
      provider,
      manifest: {
        apiVersion: "postgresql.cnpg.io/v1",
        kind: "ScheduledBackup",
        metadata: {
          name: "postgres-cluster",
          namespace: options.namespace,
        },
        spec: {
          immediate: true,
          // weekly midnight on Sunday
          schedule: "* 0 0 * * 0",
          backupOwnerReference: "self",
          method: "plugin",
          pluginConfiguration: {
            name: "barman-cloud.cloudnative-pg.io",
            parameters: {
              barmanObjectName: barmanStoreName,
              serverName: backupServerName,
            },
          },
          cluster: {
            name: options.name,
          },
        },
      },
    });
  }
}
