import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

export class TLSOptions extends Construct {
  constructor(
    scope: Construct,
    id: string,
    opts: { provider: KubernetesProvider; namespace: string },
  ) {
    super(scope, id);

    const { provider, namespace } = opts;

    new Manifest(this, "traefik-tls-options", {
      provider,
      manifest: {
        apiVersion: "traefik.io/v1alpha1",
        kind: "TLSOption",
        metadata: {
          namespace,
          name: "tls-options",
        },
        spec: {
          minVersion: "VersionTLS13",
          sniStrict: true,
        },
      },
    });
  }
}
