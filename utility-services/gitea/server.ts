import * as fs from "fs";
import * as path from "path";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

import {
  OnePasswordSecret,
  PublicIngressRoute,
  IngressRouteTcp,
} from "../../utils";
import type { Providers } from "../../types";

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

    new OnePasswordSecret(this, "admin", {
      provider: kubernetes,
      name: "gitea-admin",
      namespace: options.namespace,
      itemPath: "vaults/Lab/items/gitea-admin",
    });

    new OnePasswordSecret(this, "oauth", {
      provider: kubernetes,
      name: "gitea-oauth",
      namespace: options.namespace,
      itemPath: "vaults/Lab/items/gitea-oauth",
    });

    new OnePasswordSecret(this, "smtp", {
      provider: kubernetes,
      name: "gitea-smtp-token",
      namespace: options.namespace,
      itemPath: "vaults/Lab/items/smtp-token",
    });

    new OnePasswordSecret(this, "r2", {
      provider: kubernetes,
      name: "gitea-cloudflare-token",
      namespace: options.namespace,
      itemPath: "vaults/Lab/items/cloudflare",
    });

    new Release(this, id, {
      ...options,
      provider: helm,
      repository: "https://dl.gitea.com/charts",
      chart: "gitea",
      createNamespace: true,
      set: [
        {
          name: "gitea.config.storage.MINIO_ENDPOINT",
          value: options.r2Endpoint,
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
      namespace: options.namespace,
      name: options.name,
      match: "HostSNI(`*`)",
      entryPoint: "ssh",
      serviceName: `${options.name}-ssh`,
      servicePort: 22,
    });

    new PublicIngressRoute(this, "http-ingress", {
      provider: kubernetes,
      namespace: options.namespace,
      name: options.name,
      host: "git.dogar.dev",
      serviceName: `${options.name}-http`,
      servicePort: 3000,
    });
  }
}
