import { Construct } from "constructs";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";
import { IngressV1 } from "@cdktf/provider-kubernetes/lib/ingress-v1";
import { PersistentVolumeClaimV1 } from "@cdktf/provider-kubernetes/lib/persistent-volume-claim-v1";

export interface NixCacheProps {
  namespace: string;
  host: string;
  ingressClassName?: string;
  externalName?: string;
}

export class NixCache extends Construct {
  constructor(scope: Construct, id: string, props: NixCacheProps) {
    super(scope, id);

    const {
      namespace,
      host,
      ingressClassName: ingressClass = "nginx-internal",
      externalName: upstreamHost = "cache.nixos.org",
    } = props;

    // 1) ExternalName Service -> cache.nixos.org
    new ServiceV1(this, "nixcache-upstream-svc", {
      metadata: {
        name: "nixcache-upstream",
        namespace,
      },
      spec: {
        type: "ExternalName",
        externalName: upstreamHost,
      },
    });

    // 2) Ingress that targets the ExternalName Service over HTTPS:443
    new IngressV1(this, "nixcache-ingress", {
      metadata: {
        name: "nix-cache",
        namespace,
        annotations: {
          // Use the cache zone defined in controller.config.http-snippet
          "nginx.ingress.kubernetes.io/proxy-cache": "cachecache",
          "nginx.ingress.kubernetes.io/proxy-cache-valid": "200 302 60d",
          "nginx.ingress.kubernetes.io/proxy-cache-lock": "true",
          "nginx.ingress.kubernetes.io/proxy-buffering": "on",

          // Upstream is HTTPS with SNI and a fixed Host header
          "nginx.ingress.kubernetes.io/backend-protocol": "HTTPS",
          "nginx.ingress.kubernetes.io/proxy-ssl-server-name": "true",
          "nginx.ingress.kubernetes.io/upstream-vhost": upstreamHost,

          // Use cert-manager to provision TLS certs via Cloudflare
          "cert-manager.io/cluster-issuer": "cloudflare-issuer",
          "cert-manager.io/acme-challenge-type": "dns01",
          "cert-manager.io/private-key-size": "4096",
        },
      },
      spec: {
        ingressClassName: ingressClass,
        rule: [
          {
            host,
            http: {
              path: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name: "nixcache-upstream",
                      port: { number: 443 },
                    },
                  },
                },
              ],
            },
          },
        ],
        tls: [
          {
            hosts: [host],
            secretName: "nix-cache-tls",
          },
        ],
      },
    });

    // 3) PersistentVolumeClaim for caching
    new PersistentVolumeClaimV1(this, "nix-cache-pvc", {
      metadata: {
        name: "nix-cache",
        namespace,
      },
      spec: {
        accessModes: ["ReadWriteMany"],
        resources: {
          requests: {
            storage: "128Gi",
          },
        },
      },
    });
  }
}
