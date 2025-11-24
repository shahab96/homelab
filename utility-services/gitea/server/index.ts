import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

import {
  OnePasswordSecret,
  PublicIngressRoute,
  IngressRouteTcp,
  PrivateCertificate,
} from "../../../utils";
import type { Providers } from "../../../types";

type GiteaServerOptions = {
  providers: Providers;
  name: string;
  namespace: string;
  r2Endpoint: string;
};

export class GiteaServer extends Construct {
  constructor(scope: Construct, id: string, options: GiteaServerOptions) {
    super(scope, id);

    const { kubernetes, helm } = options.providers;
    const { name, namespace, r2Endpoint } = options;

    new OnePasswordSecret(this, "admin", {
      provider: kubernetes,
      name: "gitea-admin",
      namespace,
      itemPath: "vaults/Lab/items/gitea-admin",
    });

    new OnePasswordSecret(this, "oauth", {
      provider: kubernetes,
      name: "gitea-oauth",
      namespace,
      itemPath: "vaults/Lab/items/gitea-oauth",
    });

    new OnePasswordSecret(this, "smtp", {
      provider: kubernetes,
      name: "gitea-smtp-token",
      namespace,
      itemPath: "vaults/Lab/items/smtp-token",
    });

    new OnePasswordSecret(this, "r2", {
      provider: kubernetes,
      name: "gitea-cloudflare-token",
      namespace,
      itemPath: "vaults/Lab/items/cloudflare",
    });

    new PrivateCertificate(this, "internal-cert", {
      provider: kubernetes,
      namespace,
      name: "gitea-tls-internal",
      secretName: "gitea-tls-internal",
      dnsNames: [
        "git.dogar.dev",
        "gitea",
        "gitea.homelab.svc",
        "gitea.homelab.svc.cluster.local",
      ],
      usages: ["digital signature", "key encipherment", "server auth"],
    });

    new Release(this, id, {
      ...options,
      provider: helm,
      repository: "https://dl.gitea.com/charts",
      chart: "gitea",
      namespace,
      createNamespace: true,
      set: [
        {
          name: "gitea.config.storage.MINIO_ENDPOINT",
          value: r2Endpoint,
        },
      ],
      values: [
        fs.readFileSync(path.join(__dirname, "values.yaml"), {
          encoding: "utf8",
        }),
      ],
    });

    new IngressRouteTcp(this, "ssh-ingress", {
      provider: kubernetes,
      namespace,
      name,
      match: "HostSNI(`*`)",
      entryPoint: "ssh",
      serviceName: `${name}-ssh`,
      servicePort: 22,
    });

    new PublicIngressRoute(this, "http-ingress", {
      provider: kubernetes,
      namespace,
      name,
      host: "git.dogar.dev",
      serviceName: `${name}-http`,
      servicePort: 3000,
      serviceProtocol: "https",
    });
  }
}
