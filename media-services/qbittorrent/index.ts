import { Construct } from "constructs";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { InternalIngressRoute, LonghornPvc } from "../../utils";
import {
  BaseMediaServiceOptions,
  getAamil3NodeSelector,
  getCommonEnv,
} from "../types";

type QBittorrentServerOptions = BaseMediaServiceOptions & {
  /** Name of the shared downloads PVC */
  downloadsPvcName: string;
  /** Hostname for the ingress */
  host: string;
};

export class QBittorrentServer extends Construct {
  constructor(
    scope: Construct,
    id: string,
    options: QBittorrentServerOptions,
  ) {
    super(scope, id);

    const { provider, namespace, downloadsPvcName, host } = options;
    const name = "qbittorrent";

    // Config PVC with backup
    const configPvc = new LonghornPvc(this, "config", {
      provider,
      name: "qbittorrent-config",
      namespace,
      size: "512Mi",
      backup: true,
    });

    // Service
    new ServiceV1(this, "service", {
      provider,
      metadata: {
        name,
        namespace,
      },
      spec: {
        selector: {
          app: name,
        },
        port: [
          {
            name: "http",
            port: 80,
            targetPort: "8080",
          },
        ],
        type: "ClusterIP",
      },
    });

    // Deployment
    new DeploymentV1(this, "deployment", {
      provider,
      metadata: {
        name,
        namespace,
      },
      spec: {
        replicas: "1",
        selector: {
          matchLabels: {
            app: name,
          },
        },
        template: {
          metadata: {
            labels: {
              app: name,
            },
          },
          spec: {
            nodeSelector: getAamil3NodeSelector(),
            container: [
              {
                name,
                image: "lscr.io/linuxserver/qbittorrent:latest",
                port: [
                  {
                    containerPort: 8080,
                    name: "http",
                  },
                  {
                    containerPort: 6881,
                    name: "bt",
                  },
                  {
                    containerPort: 6881,
                    protocol: "UDP",
                    name: "bt-udp",
                  },
                ],
                env: [
                  ...getCommonEnv(),
                  {
                    name: "WEBUI_PORT",
                    value: "8080",
                  },
                ],
                volumeMount: [
                  {
                    name: "config",
                    mountPath: "/config",
                  },
                  {
                    name: "downloads",
                    mountPath: "/downloads",
                  },
                ],
              },
            ],
            volume: [
              {
                name: "config",
                persistentVolumeClaim: {
                  claimName: configPvc.name,
                },
              },
              {
                name: "downloads",
                persistentVolumeClaim: {
                  claimName: downloadsPvcName,
                },
              },
            ],
          },
        },
      },
    });

    // Ingress
    new InternalIngressRoute(this, "ingress", {
      provider,
      namespace,
      name,
      host,
      serviceName: name,
      servicePort: 80,
    });
  }
}
