import { Construct } from "constructs";
import { IngressRoute, IngressRouteOptions } from "./ingress";

export class InternalIngressRoute extends IngressRoute {
  constructor(
    scope: Construct,
    id: string,
    opts: Omit<IngressRouteOptions, "entryPoints" | "middlewares">,
  ) {
    super(scope, id, {
      ...opts,
      entryPoints: ["websecure"],
      middlewares: ["homelab/ip-allow-list"],
    });
  }
}
