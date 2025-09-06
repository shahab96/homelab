# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a homelab infrastructure-as-code project using CDKTF (Cloud Development Kit for Terraform) with TypeScript. The project defines and manages a complete Kubernetes-based homelab environment including various services like GitLab, Postgres clusters, authentication systems, and monitoring solutions.

## Architecture

The project follows a modular architecture pattern where each service is implemented as a TypeScript class extending `Construct`. The main stack is defined in `main.ts` which orchestrates all the services:

- **Core Stack**: Located in `main.ts` - defines the main `Homelab` class that manages all infrastructure components
- **Service Modules**: Each service (Gitea, Postgres, Authentik, etc.) is in its own directory with an `index.ts` file
- **Helm Values**: Service-specific Helm chart values are stored in `helm/values/` directory
- **State Management**: Uses Cloudflare R2 as the Terraform state backend

### Key Services Managed

- **GitLab Server** (`gitea/`) - Self-hosted Git repository management
- **PostgreSQL Cluster** (`postgres/`) - Multi-instance database cluster with TLS certificates
- **Authentik** (`authentik/`) - Identity and access management
- **Redis Cluster** (`redis/`) - In-memory data structure store
- **Monitoring Stack** (`prometheus/`) - Prometheus-based monitoring
- **Storage** (`longhorn/`) - Distributed block storage
- **Load Balancing** (`metallb/`) - Bare metal load balancer
- **Ingress** (`nginx/`) - HTTP/HTTPS ingress controller
- **DNS** (`pihole/`) - Network-wide ad blocking
- **Secret Management** (`1password/`) - External secrets integration

## Development Commands

### Build and Compilation
```bash
npm run build          # Compile TypeScript to JavaScript
npm run compile        # Compile with pretty output
npm run watch          # Watch mode for development
```

### CDKTF Operations
```bash
npm run get            # Download and generate provider bindings
npm run synth          # Generate Terraform configuration
cdktf deploy           # Deploy infrastructure
cdktf destroy          # Destroy infrastructure
```

### Environment Setup
```bash
nix develop            # Enter development environment (requires Nix)
```

## Development Environment

The project uses Nix for development environment management. The `flake.nix` provides:
- Node.js 24
- Terraform and CDKTF CLI
- Kubernetes tooling (kubectl, helm)
- Development tools (TypeScript LSP, prettier, jq)
- Infrastructure tools (tflint, awscli2)

## Environment Variables

Required environment variables (defined in `.env`):
- `R2_ACCESS_KEY_ID` - Cloudflare R2 access key
- `R2_SECRET_ACCESS_KEY` - Cloudflare R2 secret key  
- `ACCOUNT_ID` - Cloudflare account ID
- `BUCKET` - R2 bucket name for state storage

## TypeScript Configuration

The project uses strict TypeScript configuration with:
- Target: ES2018
- Module: CommonJS
- Strict type checking enabled
- Declaration files generated
- Incremental compilation

## Working with Services

Each service follows a consistent pattern:
1. Service class in `{service}/index.ts`
2. Helm values file in `helm/values/{service}.values.yaml`
3. Service instantiated in `main.ts` with required providers and configuration

When adding new services:
- Create a new directory with `index.ts`
- Define a TypeScript class extending `Construct`
- Add Helm values file if using Helm charts
- Import and instantiate in `main.ts`

## Certificate Management

The PostgreSQL cluster includes comprehensive TLS certificate management using cert-manager:
- Self-signed root CA certificates
- Separate server and client certificate chains
- Automatic certificate rotation
- Client certificates for database users

## Storage and Networking

- **Storage Class**: Uses `longhorn-crypto` for encrypted persistent volumes
- **Networking**: MetalLB provides load balancer services for bare metal
- **DNS**: Custom CoreDNS configuration for internal name resolution
- **Ingress**: Nginx ingress controller for HTTP/HTTPS traffic