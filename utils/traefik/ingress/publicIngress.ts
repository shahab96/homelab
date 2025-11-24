import { Construct } from "constructs";
import { IngressRoute, IngressRouteOptions } from "./ingress";
import { CloudflareCertificate } from "../../cert-manager";

type PublicIngressRouteOptions = Omit<
  IngressRouteOptions,
  "entryPoints" | "tlsSecretName" | "middlewares"
>;

export class PublicIngressRoute extends Construct {
  constructor(scope: Construct, id: string, opts: PublicIngressRouteOptions) {
    super(scope, id);

    const {
      provider,
      name,
      namespace,
      host,
      serviceName,
      servicePort,
      serviceProtocol,
    } = opts;

    const tlsSecretName = `${name}-tls`;

    new CloudflareCertificate(this, `${name}-cert`, {
      provider,
      namespace,
      name: host,
      secretName: tlsSecretName,
      dnsNames: [host],
    });

    new IngressRoute(this, opts.name, {
      provider,
      namespace,
      host,
      tlsSecretName,
      serviceName,
      servicePort,
      serviceProtocol,
      name,
      path: opts.path ?? "/",
      entryPoints: ["websecure"],
      middlewares: [`${namespace}/rate-limit`],
    });
  }
}
