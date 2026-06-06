import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { PersistentVolumeClaimV1 } from "@cdktf/provider-kubernetes/lib/persistent-volume-claim-v1";
import { namespace } from "@cdktf/provider-kubernetes";

type LonghornPvcOptions = {
  provider: KubernetesProvider;

  /** Name of the PVC */
  name: string;

  /** Namespace of the PVC */
  namespace: string;

  /** Size, e.g. "10Gi" */
  size: string;

  /** Access modes (default: ["ReadWriteOnce"]) */
  accessModes?: string[];

  /** Optional PVC labels */
  labels?: Record<string, string>;

  /** Optional PVC annotations */
  annotations?: Record<string, string>;

  /** Add backup annotations */
  backup?: boolean;
};

export class LonghornPvc extends Construct {
  public readonly name: string;

  constructor(scope: Construct, id: string, opts: LonghornPvcOptions) {
    super(scope, id);

    this.name = opts.name;

    const labels: Record<string, string> = opts.labels ?? {};
    const annotations: Record<string, string> = opts.annotations ?? {};

    if (opts.backup) {
      labels["recurring-job.longhorn.io/daily-backup"] = "enabled";
      labels["recurring-job.longhorn.io/source"] = "enabled";
    }

    new PersistentVolumeClaimV1(this, id, {
      provider: opts.provider,
      metadata: {
        name: opts.name,
        namespace: opts.namespace,
        labels,
        annotations,
      },
      spec: {
        accessModes: opts.accessModes ?? ["ReadWriteOnce"],
        storageClassName: "longhorn",
        resources: {
          requests: {
            storage: opts.size,
          },
        },
      },
    }).importFrom(`${opts.namespace}/${opts.name}`);
  }
}
