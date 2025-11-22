import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

import { CloudflareCertificate } from "../cert-manager";

export interface IngressRouteOptions {
  provider: KubernetesProvider;
  namespace: string;

  /** Hostname for this route (e.g. npm.dogar.dev) */
  host: string;

  /** Path prefix (default: "/") */
  path?: string;

  /** Backend K8s Service */
  serviceName: string;
  servicePort: number;

  /** EntryPoints (default: ["websecure"]) */
  entryPoints?: string[];

  /** TLS secret name for HTTPS termination */
  tlsSecretName?: string;

  /** Extra middlewares (traefik format: namespace/name) */
  middlewares?: string[];

  /** Name override (otherwise auto) */
  name?: string;
}

export class IngressRoute extends Construct {
  public readonly manifest: Manifest;

  constructor(scope: Construct, id: string, opts: IngressRouteOptions) {
    super(scope, id);

    const name = opts.name ?? `route-${opts.host.replace(/\./g, "-")}`;
    const path = opts.path ?? "/";
    const entryPoints = opts.entryPoints ?? ["websecure"];

    const route: any = {
      match: `Host(\`${opts.host}\`) && PathPrefix(\`${path}\`)`,
      kind: "Rule",
      services: [
        {
          name: opts.serviceName,
          port: opts.servicePort,
        },
      ],
    };

    if (opts.middlewares?.length) {
      route.middlewares = opts.middlewares.map((mw) => {
        const [namespace, name] = mw.split("/");
        return { name, namespace };
      });
    }

    const spec: any = {
      entryPoints,
      routes: [route],
    };

    if (opts.tlsSecretName) {
      spec.tls = {
        secretName: opts.tlsSecretName,
      };

      new CloudflareCertificate(this, `${name}-cert`, {
        provider: opts.provider,
        namespace: opts.namespace,
        name: opts.host,
        secretName: opts.tlsSecretName,
        dnsNames: [opts.host],
      });
    }

    this.manifest = new Manifest(this, name, {
      provider: opts.provider,
      manifest: {
        apiVersion: "traefik.io/v1alpha1",
        kind: "IngressRoute",
        metadata: {
          name,
          namespace: opts.namespace,
        },
        spec,
      },
    });
  }
}
