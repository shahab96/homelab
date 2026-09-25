import { Construct } from "constructs";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { InternalIngressRoute, LonghornPvc } from "../../utils";
import {
  BaseMediaServiceOptions,
  getAamil3NodeSelector,
  getCommonEnv,
} from "../types";

type ChaptarrServerOptions = BaseMediaServiceOptions & {
  /** Name of the shared downloads PVC */
  downloadsPvcName: string;
  /** Hostname for the ingress */
  host: string;
  /** Secret name for the TLS certificate */
  certificateSecretName: string;
};

export class ChaptarrServer extends Construct {
  constructor(scope: Construct, id: string, options: ChaptarrServerOptions) {
    super(scope, id);

    const { provider, namespace, downloadsPvcName, host } = options;
    const name = "chaptarr";

    // Config PVC with backup
    const configPvc = new LonghornPvc(this, "config", {
      provider,
      name: "chaptarr-config",
      namespace,
      size: "1Gi",
      backup: true,
    });

    // Dedicated audiobooks PVC
    const audiobooksPvc = new LonghornPvc(this, "audiobooks-pvc", {
      provider,
      name: "chaptarr-audiobooks",
      namespace,
      size: "1Gi",
    });

    // Dedicated ebooks PVC
    const ebooksPvc = new LonghornPvc(this, "ebooks-pvc", {
      provider,
      name: "chaptarr-ebooks",
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
            targetPort: "8789",
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
                image: "chaptarr/chaptarr:latest",
                imagePullPolicy: "IfNotPresent",
                port: [
                  {
                    containerPort: 8789,
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
                    name: "audiobooks",
                    mountPath: "/audiobooks",
                  },
                  {
                    name: "ebooks",
                    mountPath: "/ebooks",
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
                name: "audiobooks",
                persistentVolumeClaim: {
                  claimName: audiobooksPvc.name,
                },
              },
              {
                name: "ebooks",
                persistentVolumeClaim: {
                  claimName: ebooksPvc.name,
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
      tlsSecretName: options.certificateSecretName,
    });
  }
}
