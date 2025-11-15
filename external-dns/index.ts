import * as fs from "fs";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { Construct } from "constructs";

type ExternalDNSOptions = {
  provider: HelmProvider;
  name: string;
  namespace: string;
};

export class ExternalDNS extends Construct {
  constructor(scope: Construct, id: string, options: ExternalDNSOptions) {
    super(scope, id);

    new Release(this, "external-dns", {
      ...options,
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
