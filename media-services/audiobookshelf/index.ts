import { Construct } from "constructs";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { InternalIngressRoute, LonghornPvc } from "../../utils";
import {
  BaseMediaServiceOptions,
  getWorkerNodeSelector,
  getCommonEnv,
} from "../types";

type AudiobookshelfOptions = BaseMediaServiceOptions & {
  /** Hostname for the ingress */
  host: string;
  /** Secret name for the TLS certificate */
  certificateSecretName: string;
};

export class AudiobookshelfServer extends Construct {
  constructor(scope: Construct, id: string, options: AudiobookshelfOptions) {
    super(scope, id);

    const { provider, namespace, host } = options;
    const name = "audiobookshelf";

    // Config PVC with backup
    const configPvc = new LonghornPvc(this, "config", {
      provider,
      name: "audiobookshelf-config",
      namespace,
      size: "1Gi",
      backup: true,
    });

    // Dedicated media PVC for audiobooks/podcasts
    const mediaPvc = new LonghornPvc(this, "media-pvc", {
      provider,
      name: "audiobookshelf-media",
      namespace,
      size: "1Gi",
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
            targetPort: "80",
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
            nodeSelector: getWorkerNodeSelector(),
            container: [
              {
                name,
                image: "ghcr.io/advplyr/audiobookshelf:latest",
                imagePullPolicy: "IfNotPresent",
                port: [
                  {
                    containerPort: 80,
                    name: "http",
                  },
                ],
                env: getCommonEnv(),
                volumeMount: [
                  {
                    name: "config",
                    mountPath: "/config",
                  },
                  {
                    name: "media",
                    mountPath: "/media",
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
                name: "media",
                persistentVolumeClaim: {
                  claimName: mediaPvc.name,
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
      tlsSecretName: options.certificateSecretName,
    });
  }
}
