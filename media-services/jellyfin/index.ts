import { Construct } from "constructs";
import { DeploymentV1 } from "@cdktf/provider-kubernetes/lib/deployment-v1";
import { ServiceV1 } from "@cdktf/provider-kubernetes/lib/service-v1";

import {
  CloudflareCertificate,
  InternalIngressRoute,
  LonghornPvc,
} from "../../utils";
import { BaseMediaServiceOptions, getAamil3NodeSelector } from "../types";

type JellyfinServerOptions = BaseMediaServiceOptions & {
  /** Name of the shared media PVC */
  mediaPvcName: string;
  /** Hostname for the ingress */
  host: string;
};

export class JellyfinServer extends Construct {
  constructor(scope: Construct, id: string, options: JellyfinServerOptions) {
    super(scope, id);

    const { provider, namespace, mediaPvcName, host } = options;
    const name = "server";

    // Config PVC with backup
    const configPvc = new LonghornPvc(this, "config", {
      provider,
      name: "jellyfin-config",
      namespace,
      size: "5Gi",
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
            targetPort: "http",
          },
          {
            name: "discovery",
            port: 7359,
            targetPort: "discovery",
          },
        ],
        type: "LoadBalancer",
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
                image: "jellyfin/jellyfin:latest",
                imagePullPolicy: "IfNotPresent",
                port: [
                  {
                    containerPort: 8096,
                    name: "http",
                  },
                  {
                    containerPort: 7359,
                    name: "discovery",
                  },
                ],
                env: [
                  {
                    name: "TZ",
                    value: "Asia/Karachi",
                  },
                ],
                volumeMount: [
                  {
                    name: "config",
                    mountPath: "/config",
                  },
                  {
                    name: "cache",
                    mountPath: "/cache",
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
                name: "cache",
                emptyDir: {},
              },
              {
                name: "media",
                persistentVolumeClaim: {
                  claimName: mediaPvcName,
                },
              },
            ],
          },
        },
      },
    });

    new CloudflareCertificate(this, "certificate", {
      provider,
      namespace,
      name,
      secretName: "jellyfin-tls",
      dnsNames: [host],
    });

    // Ingress - using internal ingress for secure access
    new InternalIngressRoute(this, "ingress", {
      provider,
      namespace,
      name,
      host,
      serviceName: name,
      servicePort: 80,
      tlsSecretName: "jellyfin-tls",
    });
  }
}
