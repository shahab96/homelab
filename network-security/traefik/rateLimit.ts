import { Construct } from "constructs";
import { Manifest } from "@cdktf/provider-kubernetes/lib/manifest";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";

type RateLimitMiddlewareOptions = {
  provider: KubernetesProvider;
  namespace: string;
  name: string;

  average?: number; // default 60
  burst?: number; // default 120
  period?: string; // default "1s"
};

export class RateLimitMiddleware extends Construct {
  public readonly ref: string;

  constructor(scope: Construct, id: string, opts: RateLimitMiddlewareOptions) {
    super(scope, id);

    const average = opts.average ?? 60;
    const burst = opts.burst ?? 120;
    const period = opts.period ?? "1s";

    this.ref = `${opts.namespace}/${opts.name}`;

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
          rateLimit: {
            average,
            burst,
            period,
            redis: {
              endpoints: [`valkey.${opts.namespace}.svc.cluster.local:6379`],
              secret: "valkey",
              db: 5,
            },
          },
        },
      },
    });
  }
}
