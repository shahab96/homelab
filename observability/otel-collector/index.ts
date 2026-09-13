import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { Construct } from "constructs";

type OtelCollectorOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;
};

export class OtelCollector extends Construct {
  constructor(scope: Construct, id: string, options: OtelCollectorOptions) {
    super(scope, id);

    const { provider, namespace, name } = options;

    new Manifest(this, "service-account", {
      provider,
      manifest: {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: { name, namespace },
      },
    });

    new Manifest(this, "cluster-role", {
      provider,
      manifest: {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "ClusterRole",
        metadata: { name },
        rules: [
          {
            apiGroups: [""],
            resources: ["pods", "namespaces", "nodes"],
            verbs: ["get", "list", "watch"],
          },
          {
            apiGroups: ["apps"],
            resources: ["replicasets"],
            verbs: ["get", "list", "watch"],
          },
        ],
      },
    });

    new Manifest(this, "cluster-role-binding", {
      provider,
      manifest: {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "ClusterRoleBinding",
        metadata: { name },
        roleRef: {
          apiGroup: "rbac.authorization.k8s.io",
          kind: "ClusterRole",
          name,
        },
        subjects: [{ kind: "ServiceAccount", name, namespace }],
      },
    });

    new Manifest(this, "collector", {
      provider,
      manifest: {
        apiVersion: "opentelemetry.io/v1beta1",
        kind: "OpenTelemetryCollector",
        metadata: { name, namespace },
        spec: {
          mode: "daemonset",
          serviceAccount: name,
          volumes: [
            {
              name: "varlog",
              hostPath: { path: "/var/log" },
            },
            {
              name: "varlibdockercontainers",
              hostPath: { path: "/var/lib/docker/containers" },
            },
          ],
          volumeMounts: [
            { name: "varlog", mountPath: "/var/log", readOnly: true },
            {
              name: "varlibdockercontainers",
              mountPath: "/var/lib/docker/containers",
              readOnly: true,
            },
          ],
          config: {
            receivers: {
              otlp: {
                protocols: { grpc: {}, http: {} },
              },
              filelog: {
                include: ["/var/log/pods/*/*/*.log"],
                exclude: [
                  `/var/log/pods/${namespace}_*/*/*.log`,
                  "/var/log/pods/monitoring_*/*/*.log",
                ],
                start_at: "end",
                include_file_path: true,
                include_file_name: false,
                operators: [{ id: "container-parser", type: "container" }],
              },
            },
            processors: {
              memory_limiter: {
                check_interval: "1s",
                limit_mib: 400,
                spike_limit_mib: 100,
              },
              k8sattributes: {
                extract: {
                  metadata: [
                    "k8s.namespace.name",
                    "k8s.pod.name",
                    "k8s.node.name",
                    "k8s.container.name",
                    "k8s.deployment.name",
                    "k8s.statefulset.name",
                    "k8s.daemonset.name",
                    "container.image.name",
                  ],
                },
              },
              batch: {},
            },
            exporters: {
              "otlphttp/loki": {
                endpoint: "http://loki.monitoring.svc.cluster.local:3100/otlp",
              },
              "otlp/tempo": {
                endpoint: "tempo.monitoring.svc.cluster.local:4317",
                tls: { insecure: true },
              },
            },
            service: {
              pipelines: {
                logs: {
                  receivers: ["otlp", "filelog"],
                  processors: ["memory_limiter", "k8sattributes", "batch"],
                  exporters: ["otlphttp/loki"],
                },
                traces: {
                  receivers: ["otlp"],
                  processors: ["memory_limiter", "k8sattributes", "batch"],
                  exporters: ["otlp/tempo"],
                },
              },
            },
          },
        },
      },
    });
  }
}
