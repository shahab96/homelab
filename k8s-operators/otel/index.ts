import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type OpenTelemetryOptions = {
  provider: HelmProvider;
  name: string;
  version: string;
};

export class OpenTelemetry extends Construct {
  constructor(scope: Construct, id: string, options: OpenTelemetryOptions) {
    super(scope, id);

    const { provider, name, version } = options;

    new Release(this, "otel-operator", {
      provider,
      name,
      chart: "opentelemetry-operator",
      version,
      repository: "https://open-telemetry.github.io/opentelemetry-helm-charts",
      namespace: "monitoring",
      createNamespace: true,
    });
  }
}
