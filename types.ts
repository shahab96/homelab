import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";

export type Providers = {
  kubernetes: KubernetesProvider;
  helm: HelmProvider;
};
