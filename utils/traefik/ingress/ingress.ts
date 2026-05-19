import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

import { PrivateCertificate } from "../../cert-manager";

export type IngressRouteOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;

  /** Hostname for this route (e.g. npm.dogar.dev) */
  host: string;

  /** Path prefix (default: "/") */
  path?: string;

  /** Backend K8s Service */
  serviceName: string;
  servicePort: number;
  serviceProtocol?: "http" | "https";

  /** EntryPoints (default: ["websecure"]) */
  entryPoints?: string[];

  /** TLS secret name for HTTPS termination */
  tlsSecretName?: string;

  /** Extra middlewares (traefik format: namespace/name) */
  middlewares?: string[];
};

export class IngressRoute extends Construct {
  public readonly manifest: Manifest;

  constructor(scope: Construct, id: string, opts: IngressRouteOptions) {
    super(scope, id);

    const name = opts.name;
    const path = opts.path ?? "/";
    const entryPoints = opts.entryPoints ?? ["websecure"];

    const { provider, namespace } = opts;

    if (opts.serviceProtocol === "https") {
      new PrivateCertificate(this, "internal-cert", {
        provider,
        namespace,
        name: `${opts.serviceName}-tls-internal`,
        secretName: `${opts.serviceName}-tls-internal`,
        dnsNames: [
          opts.serviceName,
          `${opts.serviceName}.${opts.namespace}.svc`,
          `${opts.serviceName}.${opts.namespace}.svc.cluster.local`,
        ],
        usages: ["digital signature", "key encipherment", "server auth"],
      });

      new Manifest(this, `${name}-https-transport`, {
        provider,
        fieldManager: {
          forceConflicts: true,
        },
        manifest: {
          apiVersion: "traefik.io/v1alpha1",
          kind: "ServersTransport",
          metadata: {
            name: `${name}-https-transport`,
            namespace,
          },
          spec: {
            serverName: `${opts.serviceName}.${opts.namespace}.svc.cluster.local`,
            rootCAs: [
              {
                secret: "root-secret",
              },
            ],
            insecureSkipVerify: false,
          },
        },
      });
    }

    const route: any = {
      match: `Host(\`${opts.host}\`) && PathPrefix(\`${path}\`)`,
      kind: "Rule",
      services: [
        {
          namespace,
          name: opts.serviceName,
          port: opts.servicePort,
          scheme: opts.serviceProtocol ?? "http",
          serversTransport:
            opts.serviceProtocol === "https"
              ? `${name}-https-transport`
              : undefined,
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
        options: {
          name: "tls-options",
          namespace: "homelab",
        },
      };
    }

    this.manifest = new Manifest(this, name, {
      provider,
      manifest: {
        apiVersion: "traefik.io/v1alpha1",
        kind: "IngressRoute",
        metadata: {
          name,
          namespace,
        },
        spec,
      },
    });
  }
}
