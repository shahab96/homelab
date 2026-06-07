# AGENTS.md

> **CRITICAL: The agent must NEVER deploy, synthesize, or apply infrastructure — by any command, script, or means. This includes (but is not limited to) `cdktf deploy`, `cdktf synth`, `npm run deploy`, `npm run synth`, `terraform apply`, or any shell command that triggers deployment. Infrastructure changes are manual, user-only operations. No exceptions.**

## Dev environment

- **Requires Nix + direnv.** Run `direnv allow` to enter the dev shell (Node 24, cdktf-cli, kubectl, terraform, etc.).
- **Node >= 24** (package.json `engines`). The Nix flake provides it.
- **`cdktf.json`** entrypoint is `npx tsx main.ts` (NOT `ts-node`, despite it being a devDependency).

## Setup / preflight

- **`.env`** is gitignored but required. Validated by `envalid` in `main.ts`. Source secrets from 1Password (`op://`).
- **`npm run get`** generates `.gen/` (cdktf provider bindings). This directory is gitignored. Must run after clone and after any provider changes.
- **`npm run build`** (or `compile`) runs `tsc`. It may emit compiled `.js`/`.d.ts` files. Agents must prefer `npx tsc --noEmit` for verification unless the user explicitly asks for emitted build output.
- **Agents must NEVER create, emit, generate, or leave behind `.js` or `.d.ts` files.** If any command would produce them, use a no-emit equivalent or do not run it. If generated accidentally, remove only the generated files from the agent's own command before finishing.

## Commands

| Command | What it does |
|---|---|
| `npm run get` | Generate cdktf provider bindings into `.gen/` |
| `npm run build` | TypeScript compilation (tsc, strict mode) |
| `npm run synth` | Synthesize Terraform JSON into `cdktf.out/` |
| `npm run deploy` | Deploy ALL stacks (cdktf deploy) |
| `cdktf deploy <stack>` | Deploy a single stack (e.g. `core-services`) |

- **No tests, no linter, no formatter** configured. `npm run build` is the only verification step.
- Prettier and tflint are available in the Nix shell but have no config files in the repo.

## Architecture

This is a **CDK for Terraform (CDKTF) project** provisioning a single Kubernetes cluster.

### Layers (must deploy in order)

```
core-services → k8s-operators → pki → network-security → utility-services
                                                       → gaming-services
                                                       → media-services

utility-services → cache-infrastructure
                → netbird
                → authentik
```

Each layer is a `TerraformStack` class in `main.ts`. Dependencies are enforced via `node.addDependency()`.

### Pattern

- **Top-level stacks** extend `TerraformStack` (one per layer directory).
- **Services within a stack** extend `Construct` and are instantiated inside the stack's constructor.
- **Reusable constructs** live in `utils/`: cert-manager wrappers, 1Password secrets, Traefik IngressRoutes, Longhorn PVCs.
- **`LonghornPvc` creates PVCs** with `storageClassName: "longhorn"`; it does not import existing PVCs automatically.
- Shared types in `types.ts` → `Providers` (KubernetesProvider + HelmProvider pair).

### Namespaces

- `homelab` — core namespace, **imported** (must pre-exist on the cluster), not created by this code.
- `media`, `minecraft`, `package-cache` — created by their respective stacks.
- `kube-system`, `metallb-system` — system namespaces used by operators.

### Scheduling assumptions

- Many workloads require nodes labeled `nodepool=worker`.
- Media workloads also target `kubernetes.io/hostname=aamil-3`.
- These labels are runtime cluster requirements. Keep Nix/node config and live cluster labels in sync before applying infra changes.

### Kubernetes providers

All stacks create `KubernetesProvider` and `HelmProvider` pointing to `~/.kube/config`. Some use `S3Backend` for cross-stack remote state reads (PKI, utility-services read from core-services).

## State backend

All Terraform state is stored in **S3-compatible storage** (DigitalOcean Spaces). Config is in `main.ts` `deploy()` function. Credentials come from `.env` (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`).

## Secrets

- **1Password Connect** is the canonical secrets source. Secrets flow: 1Password vault → 1Password Connect Operator → Kubernetes `OnePasswordItem` CRDs.
- The `utils/1password-secret` construct wraps this pattern.
- `OP_CONNECT_TOKEN` env var is required.

## Known quirks

- **TypeScript 6.x** and **cdktf 0.21.x** — very recent versions. Some cdktf provider packages (`@cdktf/provider-kubernetes`, `@cdktf/provider-helm`) are pinned to exact versions.
- **Homelab namespace is imported** (`importFrom("homelab")` in core-services). If it doesn't exist on the cluster, deploy fails.
- **Minecraft ATM9 and TFG are active** in `gaming-services/minecraft/index.ts`. GTNH exists as source but is commented out.
- **Gitea → Forgejo migration in progress** — both source dirs exist. Forgejo is the active one in `utility-services/index.ts`.
- **Traefik Minecraft ports need care**: `core-services/traefik/values.yaml` currently has duplicate `minecraft-atm9` port keys; the second entry is likely intended for TFG.
- **Barman plugin install is imperative** via `kubectl apply` in a `local-exec`; treat it as drift-prone compared to Terraform-managed Kubernetes resources.
- **Several images use `latest` tags** across utility, cache, media, and Netbird services. Pin before expecting reproducible rollouts.
- **Live clusters may have both `local-path` and `longhorn` marked default**. Critical PVCs should set `storageClassName` explicitly.
- Some `.js`/`.d.ts` files are committed despite `.gitignore` — these pre-date the ignore rule. Safe to leave as-is, but agents must never produce new ones.
- **`cdktf.out/`** is gitignored. CDKTF synth output is ephemeral.

## Key env vars (from `main.ts` envalid)

`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `ACCOUNT_ID` (Cloudflare), `OP_CONNECT_TOKEN`, `ACCESS_KEY`/`SECRET_KEY` (R2), `VALKEY_PASSWORD`, `AUTHENTIK_TOKEN`.
