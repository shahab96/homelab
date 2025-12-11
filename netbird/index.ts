import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";
import { DataKubernetesSecretV1 } from "@cdktf/provider-kubernetes/lib/data-kubernetes-secret-v1";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { SecretV1 } from "@cdktf/provider-kubernetes/lib/secret-v1";
import { Release } from "@cdktf/provider-helm/lib/release";
import { CloudflareCertificate, OnePasswordSecret } from "../utils";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";

export class Netbird extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const kubernetes = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
    });

    const helm = new HelmProvider(this, "helm", {
      kubernetes: {
        configPath: "~/.kube/config",
      },
    });

    const namespace = "netbird";

    // Create namespace
    new NamespaceV1(this, "namespace", {
      metadata: {
        name: namespace,
      },
    });

    new OnePasswordSecret(this, "netbird-secret", {
      name: "netbird",
      namespace,
      provider: kubernetes,
      itemPath: "vaults/Lab/items/Netbird",
    });

    const pgClientCert = new DataKubernetesSecretV1(
      this,
      "netbird-client-cert",
      {
        provider: kubernetes,
        metadata: {
          name: "netbird-client-cert",
          namespace: "homelab",
        },
      },
    );

    const pgCaCert = new DataKubernetesSecretV1(this, "postgres-ca-cert", {
      provider: kubernetes,
      metadata: {
        name: "postgres-server-cert",
        namespace: "homelab",
      },
    });

    const pgSslBundle = new SecretV1(this, "netbird-postgres-ssl", {
      provider: kubernetes,
      metadata: {
        name: "netbird-postgres-ssl-bundle",
        namespace,
      },
      data: {
        "tls.crt": pgClientCert.data.lookup("tls.crt"),
        "tls.key": pgClientCert.data.lookup("tls.key"),
        "ca.crt": pgCaCert.data.lookup("ca.crt"),
      },
    });

    new CloudflareCertificate(this, "netbird-cloudflare-cert", {
      provider: kubernetes,
      name: "netbird",
      namespace,
      dnsNames: ["vpn.dogar.dev"],
      secretName: "netbird-tls",
    });

    new Release(this, "netbird", {
      dependsOn: [pgSslBundle],
      provider: helm,
      namespace,
      createNamespace: true,
      name: "netbird",
      repository: "https://netbirdio.github.io/helms",
      chart: "netbird",
      values: [fs.readFileSync(path.join(__dirname, "values.yaml"), "utf8")],
    });

    new OnePasswordSecret(this, "netbird-setup-key", {
      name: "netbird-setup-key",
      namespace,
      provider: kubernetes,
      itemPath: "vaults/Lab/items/netbird-setup-key",
    });

    new DeploymentV1(this, "netbird-routing-peers", {
      provider: kubernetes,
      metadata: {
        name: "netbird-routing-peer",
        namespace,
      },
      spec: {
        replicas: "3",
        selector: {
          matchLabels: {
            app: "netbird-routing-peers",
          },
        },
        template: {
          metadata: {
            labels: {
              app: "netbird-routing-peers",
            },
          },
          spec: {
            container: [
              {
                name: "netbird-routing-peers",
                image: "netbirdio/netbird:latest",
                env: [
                  {
                    name: "NB_SETUP_KEY",
                    valueFrom: {
                      secretKeyRef: {
                        name: "netbird-setup-key",
                        key: "credential",
                      },
                    },
                  },
                  {
                    name: "NB_MANAGEMENT_URL",
                    value: "https://vpn.dogar.dev",
                  },
                  {
                    name: "NB_HOSTNAME",
                    value: "netbird-k8s-router",
                  },
                  {
                    name: "NB_LOG_LEVEL",
                    value: "info",
                  },
                ],
                securityContext: {
                  capabilities: {
                    add: ["NET_ADMIN", "SYS_RESOURCE", "SYS_ADMIN"],
                  },
                },
              },
            ],
          },
        },
      },
    });
  }
}
