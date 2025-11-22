import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

type IngressRouteTcpOptions = {
  provider: KubernetesProvider;
  name: string;

  /**
   * Match rule.
   * Default is `HostSNI(\`*\`)` which is correct for most TCP services.
   */
  match: string;

  /** Namespace where the IngressRouteTCP will be created */
  namespace: string;

  /** EntryPoint name (e.g., "ssh", "mc25565", "postgres", etc.) */
  entryPoint: string;

  /** Backend service name */
  serviceName: string;

  /** Backend service port */
  servicePort: number;
};

export class IngressRouteTcp extends Construct {
  public readonly manifest: Manifest;

  constructor(scope: Construct, id: string, opts: IngressRouteTcpOptions) {
    super(scope, id);

    const { name, match } = opts;

    this.manifest = new Manifest(this, name, {
      provider: opts.provider,
      manifest: {
        apiVersion: "traefik.io/v1alpha1",
        kind: "IngressRouteTCP",
        metadata: {
          name,
          namespace: opts.namespace,
        },
        spec: {
          entryPoints: [opts.entryPoint],
          routes: [
            {
              match,
              services: [
                {
                  name: opts.serviceName,
                  port: opts.servicePort,
                },
              ],
            },
          ],
        },
      },
    });
  }
}
