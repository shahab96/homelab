import { Construct } from "constructs";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { InternalIngressRoute, LonghornPvc } from "../../utils";
import {
  BaseMediaServiceOptions,
  getAamil3NodeSelector,
  getCommonEnv,
} from "../types";

type RadarrServerOptions = BaseMediaServiceOptions & {
  /** Name of the shared media PVC */
  mediaPvcName: string;
  /** Name of the shared downloads PVC */
  downloadsPvcName: string;
  /** Hostname for the ingress */
  host: string;
  /** Secret name for the TLS certificate */
  certificateSecretName: string;
};

export class RadarrServer extends Construct {
  constructor(scope: Construct, id: string, options: RadarrServerOptions) {
    super(scope, id);

    const { provider, namespace, mediaPvcName, downloadsPvcName, host } =
      options;
    const name = "radarr";

    // Config PVC with backup
    const configPvc = new LonghornPvc(this, "config", {
      provider,
      name: "radarr-config",
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
            targetPort: "7878",
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
                image: "lscr.io/linuxserver/radarr:latest",
                imagePullPolicy: "IfNotPresent",
                port: [
                  {
                    containerPort: 7878,
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
                name: "media",
                persistentVolumeClaim: {
                  claimName: mediaPvcName,
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
