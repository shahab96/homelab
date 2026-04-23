import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type OpenTelemetryOptions = {
  provider: HelmProvider;
  name: string;
};

export class OpenTelemetry extends Construct {
  constructor(scope: Construct, id: string, options: OpenTelemetryOptions) {
    super(scope, id);

    const { provider } = options;

    new Release(this, "otel-operator", {
      provider,
      name: "otel-operator",
      chart: "open-telemetry",
      repository: "https://open-telemetry.github.io/opentelemetry-helm-charts",
      namespace: "monitoring",
      createNamespace: true,
    });
  }
}
