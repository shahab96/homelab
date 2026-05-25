import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { TerraformOutput, TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { CertManager } from "./cert-manager";
import { Cilium } from "./cilium";
import { Longhorn } from "./longhorn";
import { MetalLB } from "./metallb";
import { Traefik } from "./traefik";

export class CoreServices extends TerraformStack {
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

    const namespace = "homelab";

    new NamespaceV1(this, "namespace", {
      provider: kubernetes,
      metadata: {
        name: namespace,
      },
    }).importFrom("homelab");

    new TerraformOutput(this, "namespace-output", {
      value: namespace,
    });

    new Cilium(this, "cilium", {
      provider: helm,
      name: "cilium",
      namespace: "kube-system",
    });

    new Longhorn(this, "longhorn", {
      name: "longhorn",
      providers: {
        kubernetes,
        helm,
      },
    });

    new MetalLB(this, "metallb", {
      provider: helm,
      name: "metallb",
      namespace: "metallb-system",
    });

    new Traefik(this, "traefik", {
      provider: helm,
      namespace,
      name: "traefik",
    });

    new CertManager(this, "cert-manager", {
      provider: helm,
      name: "cert-manager",
      namespace,
    });
  }
}
