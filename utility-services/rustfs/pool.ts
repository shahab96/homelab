type PoolConfig = {
  name: string;
  servers: number;
  storage: string;
  volumesPerServer?: number;
};

export function pool(config: PoolConfig) {
  return {
    name: config.name,
    servers: config.servers,
    resources: {
      requests: {
        cpu: "500m",
        memory: "1Gi",
      },
      limits: {
        cpu: "2",
        memory: "4Gi",
      },
    },
    persistence: {
      labels: {
        "recurring-job.longhorn.io/daily-backup": "enabled",
        "recurring-job.longhorn.io/source": "enabled",
      },
      volumesPerServer: config.volumesPerServer ?? 1,
      volumeClaimTemplate: {
        accessModes: ["ReadWriteOnce"],
        storageClassName: "longhorn",
        resources: {
          requests: {
            storage: config.storage,
          },
        },
      },
    },
  };
}
