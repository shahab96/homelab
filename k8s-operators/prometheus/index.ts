import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";
import { IngressRoute } from "../../utils";
import { Providers } from "../../types";

type PrometheusOptions = {
  providers: Providers;
  name: string;
  namespace: string;
  version: string;
};

export class Prometheus extends Construct {
  constructor(scope: Construct, id: string, options: PrometheusOptions) {
    super(scope, id);

    const { helm, kubernetes } = options.providers;

    new IngressRoute(this, "ingress", {
      provider: kubernetes,
      name: "grafana",
      namespace: options.namespace,
      entryPoints: ["websecure"],
      serviceName: "prometheus-operator-grafana",
      servicePort: 80,
      tlsSecretName: "grafana-tls",
      host: "grafana.dogar.dev",
    });

    new Release(this, id, {
      ...options,
      provider: helm,
      repository: "https://prometheus-community.github.io/helm-charts",
      chart: "kube-prometheus-stack",
      createNamespace: true,
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });
  }
}
