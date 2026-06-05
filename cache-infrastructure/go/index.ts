import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { ConfigMapV1 } from "@cdktf/provider-kubernetes/lib/config-map-v1";
import { DataKubernetesSecretV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-secret-v1";
import { Construct } from "constructs";

import { PublicIngressRoute } from "../../utils";
import { Providers } from "../../types";

type GoCacheOptions = {
  providers: Providers;
  namespace: string;
  name: string;
  host: string;
};

export class GoCache extends Construct {
  constructor(scope: Construct, id: string, opts: GoCacheOptions) {
    super(scope, id);

    const { namespace, name, host } = opts;
    const { helm, kubernetes } = opts.providers;

    const caSecret = new DataKubernetesSecretV1(this, "ca-secret", {
      provider: kubernetes,
      metadata: {
        name: "homelab-ca-secret",
        namespace: "homelab",
      },
    });

    new ConfigMapV1(this, "ca-configmap", {
      provider: kubernetes,
      metadata: {
        name: "rustfs-ca",
        namespace,
      },
      data: {
        "ca.crt": caSecret.data.lookup("tls.crt"),
      },
    });

    new Release(this, "helm-release", {
      provider: helm,
      name,
      namespace,
      repository: "https://gomods.github.io/athens-charts",
      chart: "athens-proxy",
      values: [fs.readFileSync(path.join(__dirname, "values.yaml"), "utf8")],
    });

    new PublicIngressRoute(this, "ingress", {
      provider: kubernetes,
      namespace,
      name,
      host,
      serviceName: `${name}-athens-proxy`,
      servicePort: 80,
    });
  }
}
