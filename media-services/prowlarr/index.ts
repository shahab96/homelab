import { Construct } from "constructs";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import { InternalIngressRoute, LonghornPvc } from "../../utils";
import {
  BaseMediaServiceOptions,
  getWorkerNodeSelector,
  getCommonEnv,
} from "../types";

type ProwlarrOptions = BaseMediaServiceOptions & {
  /** Hostname for the ingress */
  host: string;
  /** Secret name for the TLS certificate */
  certificateSecretName: string;
};

export class ProwlarrServer extends Construct {
  constructor(scope: Construct, id: string, options: ProwlarrOptions) {
    super(scope, id);

    const { provider, namespace, host } = options;
    const name = "prowlarr";

    // Config PVC with backup
    const configPvc = new LonghornPvc(this, "config", {
      provider,
      name: "prowlarr-config",
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
            targetPort: "9696",
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
                image: "lscr.io/linuxserver/prowlarr:latest",
                imagePullPolicy: "IfNotPresent",
                port: [
                  {
                    containerPort: 9696,
                    name: "http",
                  },
                ],
                env: getCommonEnv(),
                volumeMount: [
                  {
                    name: "config",
                    mountPath: "/config",
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
