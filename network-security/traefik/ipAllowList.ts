import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

type IpAllowListMiddlewareOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;
  sourceRanges: string[];
};

export class IpAllowListMiddleware extends Construct {
  constructor(
    scope: Construct,
    id: string,
    opts: IpAllowListMiddlewareOptions,
  ) {
    super(scope, id);

    new Manifest(this, opts.name, {
      provider: opts.provider,
      manifest: {
        apiVersion: "traefik.io/v1alpha1",
        kind: "Middleware",
        metadata: {
          name: opts.name,
          namespace: opts.namespace,
        },
        spec: {
          ipAllowList: {
            sourceRange: opts.sourceRanges,
          },
        },
      },
    });
  }
}

export class IpAllowListMiddlewareTCP extends Construct {
  constructor(
    scope: Construct,
    id: string,
    opts: IpAllowListMiddlewareOptions,
  ) {
    super(scope, id);

    new Manifest(this, opts.name, {
      provider: opts.provider,
      manifest: {
        apiVersion: "traefik.io/v1alpha1",
        kind: "MiddlewareTCP",
        metadata: {
          name: opts.name,
          namespace: opts.namespace,
        },
        spec: {
          ipAllowList: {
            sourceRange: opts.sourceRanges,
          },
        },
      },
    });
  }
}
