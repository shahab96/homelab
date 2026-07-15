import * as dotenv from "dotenv";
import { cleanEnv, str } from "envalid";
import { App, S3Backend, TerraformStack } from "cdktf";
import { CacheInfrastructure } from "./cache-infrastructure";
import { UtilityServices } from "./utility-services";
import { K8SOperators } from "./k8s-operators";
import { CoreServices } from "./core-services";
import { NetworkSecurity } from "./network-security";
import { GamingServices } from "./gaming-services/minecraft";
import { MediaServices } from "./media-services";
import { PKI } from "./pki";
import { Netbird } from "./netbird";
import { NetbirdResources } from "./netbird-resources";
import { Authentik } from "./authentik";

dotenv.config();

const env = cleanEnv(process.env, {
  S3_ENDPOINT: str({ desc: "Blob storage endpoint." }),
  S3_BUCKET: str({ desc: "Bucket name." }),
  S3_ACCESS_KEY: str({ desc: "Access key ID for blob storage." }),
  S3_SECRET_KEY: str({ desc: "Secret access key for blob storage." }),
  ACCOUNT_ID: str({ desc: "Cloudflare account id." }),
  OP_CONNECT_TOKEN: str({ desc: "1Password Connect token." }),
  ACCESS_KEY: str({ desc: "Access key ID for R2 storage." }),
  SECRET_KEY: str({ desc: "Secret access key for R2 storage." }),
  VALKEY_PASSWORD: str({ desc: "Password for Valkey database." }),
  AUTHENTIK_TOKEN: str({ desc: "Authentik API token." }),
});

const app = new App();
const coreServices = new CoreServices(app, "core-services");

const k8sOperators = new K8SOperators(app, "k8s-operators");
k8sOperators.node.addDependency(coreServices);

const pki = new PKI(app, "pki");
pki.node.addDependency(k8sOperators);

const networkSecurity = new NetworkSecurity(app, "network-security");
networkSecurity.node.addDependency(pki);

const utilityServices = new UtilityServices(app, "utility-services");
utilityServices.node.addDependency(networkSecurity);

const gamingServices = new GamingServices(app, "gaming-services");
gamingServices.node.addDependency(networkSecurity);

const mediaServices = new MediaServices(app, "media-services");
mediaServices.node.addDependency(networkSecurity);

const caches = new CacheInfrastructure(app, "cache-infrastructure");
caches.node.addDependency(utilityServices);

const netbird = new Netbird(app, "netbird");
netbird.node.addDependency(utilityServices);

const authentik = new Authentik(app, "authentik");
authentik.node.addDependency(utilityServices);

const netbirdResources = new NetbirdResources(app, "netbird-resources");

const deploy: (stack: TerraformStack, key: string) => S3Backend = (
  stack,
  key,
) =>
  new S3Backend(stack, {
    bucket: env.S3_BUCKET,
    key: `${key}/terraform.tfstate`,
    region: "auto",
    endpoints: {
      s3: env.S3_ENDPOINT,
    },
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    encrypt: true,
    usePathStyle: true,
    skipRegionValidation: true,
    skipCredentialsValidation: true,
    skipRequestingAccountId: true,
    skipS3Checksum: true,
  });

deploy(coreServices, "core-services");
deploy(k8sOperators, "k8s-operators");
deploy(netbird, "netbird");
deploy(netbirdResources, "netbird-resources");
deploy(pki, "pki");
deploy(networkSecurity, "network-security");
deploy(utilityServices, "utility-services");
deploy(caches, "cache-infrastructure");
deploy(gamingServices, "gaming-services");
deploy(mediaServices, "media-services");
deploy(authentik, "authentik");

app.synth();
