import * as dotenv from "dotenv";
import { cleanEnv, str } from "envalid";
import { App, S3Backend, TerraformStack } from "cdktf";
import { CacheInfrastructure } from "./cache-infrastructure";
import { UtilityServices } from "./utility-services";
import { K8SOperators } from "./k8s-operators";
import { CoreServices } from "./core-services";

dotenv.config();

const env = cleanEnv(process.env, {
  ACCOUNT_ID: str({ desc: "Cloudflare account id." }),
  OP_CONNECT_TOKEN: str({ desc: "1Password Connect token." }),
  ACCESS_KEY: str({ desc: "Access key ID for R2 storage." }),
  SECRET_KEY: str({ desc: "Secret access key for R2 storage." }),
});

const r2Endpoint = `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com`;

const app = new App();
const coreServices = new CoreServices(app, "core-services");

const k8sOperators = new K8SOperators(app, "k8s-operators");
k8sOperators.node.addDependency(coreServices);

const utilityServices = new UtilityServices(app, "utility-services");
utilityServices.node.addDependency(k8sOperators);

const caches = new CacheInfrastructure(app, "cache-infrastructure");
caches.node.addDependency(utilityServices);

const deploy: (stack: TerraformStack, key: string) => S3Backend = (
  stack,
  key,
) =>
  new S3Backend(stack, {
    bucket: "terraform-state",
    key: `${key}/terraform.tfstate`,
    region: "auto",
    endpoints: {
      s3: r2Endpoint,
    },
    accessKey: env.ACCESS_KEY,
    secretKey: env.SECRET_KEY,
    encrypt: true,
    usePathStyle: true,
    skipRegionValidation: true,
    skipCredentialsValidation: true,
    skipRequestingAccountId: true,
    skipS3Checksum: true,
  });

deploy(coreServices, "core-services");
deploy(utilityServices, "utility-services");
deploy(k8sOperators, "k8s-operators");
deploy(caches, "cache-infrastructure");

app.synth();
