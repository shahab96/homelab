import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type PiHoleOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
};

export class PiHole extends Construct {
  constructor(scope: Construct, id: string, options: PiHoleOptions) {
    super(scope, id);

    new Release(this, id, {
      ...options,
      repository: "https://mojo2600.github.io/pihole-kubernetes",
      chart: "pihole",
      values: [
        fs.readFileSync("helm/values/pihole.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });

    new Release(this, "external-dns", {
      provider: options.provider,
      name: "externaldns-pihole",
      namespace: options.namespace,
      repository: "oci://registry-1.docker.io/bitnamicharts/",
      chart: "external-dns",
      values: [
        fs.readFileSync("helm/values/externaldns.values.yaml", {
          encoding: "utf8",
        }),
      ],
    });
  }
}
