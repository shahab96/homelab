import { Construct } from "constructs";
import { IngressRoute, IngressRouteOptions } from "./ingress";
import { CloudflareCertificate } from "../../cert-manager";

export class PublicIngressRoute extends IngressRoute {
  constructor(
    scope: Construct,
    id: string,
    opts: Omit<
      IngressRouteOptions,
      "entryPoints" | "tlsSecretName" | "middlewares"
    >,
  ) {
    const tlsSecretName = `${opts.name}-tls`;

    super(scope, id, {
      ...opts,
      tlsSecretName,
      entryPoints: ["websecure"],
      middlewares: ["homelab/rate-limit"],
    });

    const { provider, name, namespace, host } = opts;

    new CloudflareCertificate(this, `${name}-cert`, {
      provider,
      namespace,
      name: host,
      secretName: tlsSecretName,
      dnsNames: [host],
    });
  }
}
