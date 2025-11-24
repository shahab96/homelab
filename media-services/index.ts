import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { NamespaceV1 } from "@cdktf/provider-kubernetes/lib/namespace-v1";

import { LonghornPvc } from "../utils";
import { JellyfinServer } from "./jellyfin";
import { SonarrServer } from "./sonarr";
import { RadarrServer } from "./radarr";
import { QBittorrentServer } from "./qbittorrent";
import { ProwlarrServer } from "./prowlarr";

export class MediaServices extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const provider = new KubernetesProvider(this, "kubernetes", {
      configPath: "~/.kube/config",
    });

    const namespace = "media";

    // Create namespace
    new NamespaceV1(this, "namespace", {
      metadata: {
        name: namespace,
      },
    });

    // Shared PVCs
    const mediaPvc = new LonghornPvc(this, "media-pvc", {
      provider,
      name: "media",
      namespace,
      size: "1Ti",
    });

    const downloadsPvc = new LonghornPvc(this, "downloads-pvc", {
      provider,
      name: "downloads",
      namespace,
      size: "450Gi",
    });

    // Deploy media services
    new JellyfinServer(this, "jellyfin", {
      provider,
      namespace,
      mediaPvcName: mediaPvc.name,
      host: "media.dogar.dev",
    });

    new SonarrServer(this, "sonarr", {
      provider,
      namespace,
      mediaPvcName: mediaPvc.name,
      downloadsPvcName: downloadsPvc.name,
      host: "sonarr.dogar.dev",
    });

    new RadarrServer(this, "radarr", {
      provider,
      namespace,
      mediaPvcName: mediaPvc.name,
      downloadsPvcName: downloadsPvc.name,
      host: "radarr.dogar.dev",
    });

    new QBittorrentServer(this, "qbittorrent", {
      provider,
      namespace,
      downloadsPvcName: downloadsPvc.name,
      host: "torrent.dogar.dev",
    });

    new ProwlarrServer(this, "prowlarr", {
      provider,
      namespace,
    });
  }
}
