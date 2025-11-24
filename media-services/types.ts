import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

/**
 * Common options shared across all media service constructs
 */
export type BaseMediaServiceOptions = {
  provider: KubernetesProvider;
  namespace: string;
};

/**
 * Common environment variables for LinuxServer.io containers
 */
export const getCommonEnv = () => [
  { name: "TZ", value: "Asia/Karachi" },
  { name: "PUID", value: "1000" },
  { name: "PGID", value: "1000" },
];

/**
 * Node selector for the aamil-3 node
 */
export const getAamil3NodeSelector = () => ({
  "kubernetes.io/hostname": "aamil-3",
});

/**
 * Node selector for worker nodepool
 */
export const getWorkerNodeSelector = () => ({
  nodepool: "worker",
});
