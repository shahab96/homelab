import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type PrometheusOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
  version: string;
};

export class Prometheus extends Construct {
  constructor(scope: Construct, id: string, options: PrometheusOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
      repository: "https://prometheus-community.github.io/helm-charts",
      chart: "kube-prometheus-stack",
      createNamespace: true,
      values: [
        fs.readFileSync("helm/values/prometheus.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });
  }
}
