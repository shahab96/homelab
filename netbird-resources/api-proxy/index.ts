import { Construct } from "constructs";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { ServiceAccountV1 } from "@cdktf/provider-kubernetes/lib/service-account-v1";
import { ClusterRoleV1 } from "@cdktf/provider-kubernetes/lib/cluster-role-v1";
import { ClusterRoleBindingV1 } from "@cdktf/provider-kubernetes/lib/cluster-role-binding-v1";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";

type ApiServerProxyOptions = {
  provider: KubernetesProvider;
  namespace: string;
};

export class ApiServerProxy extends Construct {
  constructor(scope: Construct, id: string, options: ApiServerProxyOptions) {
    super(scope, id);

    const { provider, namespace } = options;
    const name = "cluster-proxy";

    new ServiceAccountV1(this, "service-account", {
      provider,
      metadata: {
        namespace,
        name,
      },
      automountServiceAccountToken: true,
    });

    new ClusterRoleV1(this, "cluster-role", {
      provider,
      metadata: {
        name,
      },
      rule: [{
        apiGroups: [""],
        resources: ["users", "groups"],
        verbs: ["impersonate"],
      }, {
        apiGroups: ["authentication.k8s.io"],
        resources: ["userextras/*", "uids"],
        verbs: ["impersonate"],
      }],
    });

    new ClusterRoleBindingV1(this, "cluster-role-binding", {
      provider,
      metadata: {
        name,
      },
      roleRef: {
        name,
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
      },
      subject: [{
        name,
        namespace,
        kind: "ServiceAccount",
      }],
    });

    new Manifest(this, "cluster-proxy", {
      provider,
      manifest: {
        apiVersion: "netbird.io/v1alpha1",
        kind: "ClusterProxy",
        metadata: {
          namespace,
          name: "homelab",
        },
        spec: {
          clusterName: "homelab",
          serviceAccountName: name,
        },
      },
    });

    new ClusterRoleV1(this, "netbird-cluster-admin", {
      metadata: {
        name: "netbird-cluster-admin",
      },
      rule: [{
        verbs: ["*"],
        apiGroups: ["*"],
        resources: ["*"],
      }],
    });

    new ClusterRoleBindingV1(this, "netbird-cluster-admin-role-binding", {
      metadata: {
        name: "netbird-cluster-admin",
      },
      subject: [{
        kind: "Group",
        name: "Admin",
        apiGroup: "rbac.authorization.k8s.io",
      }],
      roleRef: {
        kind: "ClusterRole",
        name: "netbird-cluster-admin",
        apiGroup: "rbac.authorization.k8s.io",
      },
    });
  }
}
