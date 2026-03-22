# APM In-Container Setup for Next.js on Cloud Run

## Table of Contents

- [Architecture decision: in-container vs sidecar](#architecture-decision)
- [Dockerfile](#dockerfile)
- [service.yaml (single container)](#serviceyaml)
- [deploy.sh](#deploysh)
- [next.config.mjs](#nextconfigmjs)
- [Source Code Integration](#source-code-integration)

## Architecture decision

### In-container (RECOMMENDED)

`datadog/serverless-init:1` is copied into the app image and runs as `ENTRYPOINT`.
It starts a local Datadog Agent on `localhost:8126` inside the same container, then
execs the Node.js process. This is the only approach that works reliably on Cloud Run.

### Sidecar (NOT recommended for Cloud Run)

A separate `datadog-agent` container running alongside the app container. While
this works on Kubernetes, Cloud Run's multi-container networking does NOT reliably
bridge `localhost:8126` between containers. `dd-trace` sends traces to
`localhost:8126` by default, and in the sidecar model this address resolves to a
different container's network namespace — causing traces to silently drop.

**Symptoms of the sidecar problem:**
- dd-trace startup logs appear locally but not in Cloud Run
- Sidecar logs show `SERVERLESS_INIT | ERROR | Workloadmeta` but no trace forwarding
- Datadog APM shows zero server-side spans despite the app running correctly

## Dockerfile

Multi-stage build pattern for Next.js + Datadog APM (in-container):

```dockerfile
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ARG NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ARG NEXT_PUBLIC_DATADOG_APPLICATION_ID
ARG NEXT_PUBLIC_DATADOG_SITE
ARG NEXT_PUBLIC_DATADOG_SERVICE
ARG NEXT_PUBLIC_DATADOG_ENV
ARG NEXT_PUBLIC_DD_VERSION
ENV NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
ENV NEXT_PUBLIC_DATADOG_APPLICATION_ID=$NEXT_PUBLIC_DATADOG_APPLICATION_ID
ENV NEXT_PUBLIC_DATADOG_SITE=$NEXT_PUBLIC_DATADOG_SITE
ENV NEXT_PUBLIC_DATADOG_SERVICE=$NEXT_PUBLIC_DATADOG_SERVICE
ENV NEXT_PUBLIC_DATADOG_ENV=$NEXT_PUBLIC_DATADOG_ENV
ENV NEXT_PUBLIC_DD_VERSION=$NEXT_PUBLIC_DD_VERSION
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

# SSL certs required for serverless-init on slim images
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Datadog serverless-init: wraps the app process, flushes APM data on shutdown
COPY --from=datadog/serverless-init:1 /datadog-init /app/datadog-init

# Next.js standalone output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# dd-trace + native deps must be installed in runner (not copied from builder)
# because Next.js standalone doesn't include dd-trace and its native modules
RUN npm install --omit=dev --no-save dd-trace winston datadog-winston

EXPOSE 8080
# In-code init via instrumentation.ts — do NOT set NODE_OPTIONS="--require dd-trace/init"
ENTRYPOINT ["/app/datadog-init"]
CMD ["node", "--enable-source-maps", "server.js"]
```

### Key points

- `COPY --from=datadog/serverless-init:1 /datadog-init` copies the agent binary into the image
- `ENTRYPOINT ["/app/datadog-init"]` makes it wrap the Node.js process
- `ca-certificates` is required for SSL connections from serverless-init
- `--enable-source-maps` enables stack trace resolution for TypeScript source
- NEXT_PUBLIC_* variables passed as `ARG`+`ENV` in builder stage before `npm run build`
- `--platform=linux/amd64` should be used when building on Apple Silicon for Cloud Run

## service.yaml

Single-container Cloud Run YAML with Datadog environment variables.
All DD_* env vars go on the **app container** (not a sidecar):

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: my-service
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "20"
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      containerConcurrency: 80
      containers:
        - name: app
          image: __IMAGE_SHA__
          ports:
            - name: http1
              containerPort: 8080
          resources:
            limits:
              cpu: "1"
              memory: 1Gi
          env:
            # App config
            - name: GEMINI_API_KEY
              value: "__GEMINI_API_KEY__"
            # Datadog APM + Logs
            - name: DD_API_KEY
              value: "__DD_API_KEY__"
            - name: DD_SITE
              value: datadoghq.com
            - name: DD_SERVICE
              value: my-service
            - name: DD_ENV
              value: __DD_ENV__
            - name: DD_VERSION
              value: "__GIT_SHA__"
            - name: DD_LOGS_ENABLED
              value: "true"
            - name: DD_LOGS_INJECTION
              value: "true"
            - name: DD_SOURCE
              value: "nodejs"
            # LLM Observability
            - name: DD_LLMOBS_ENABLED
              value: "1"
            - name: DD_LLMOBS_ML_APP
              value: my-ml-app
  traffic:
    - latestRevision: true
      percent: 100
```

### Important notes

- `DD_API_KEY` goes on the app container (used by both serverless-init and agentless LLMObs)
- `DD_VERSION` should be the full git SHA (quoted)
- `DD_SOURCE: "nodejs"` enables the Datadog log pipeline for Node.js
- No sidecar container, no shared volumes, no emptyDir — just the single app container

## deploy.sh

Key patterns in the deployment script:

```bash
SHORT_SHA=$(git rev-parse --short HEAD)
GIT_SHA=$(git rev-parse HEAD)
BUILD_TAG="${SHORT_SHA}-$(date +%s)"
IMAGE_URI="region-docker.pkg.dev/project/repo/service"

# Build with NEXT_PUBLIC_* build args for client bundle
docker build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_DATADOG_CLIENT_TOKEN="$NEXT_PUBLIC_DATADOG_CLIENT_TOKEN" \
  --build-arg NEXT_PUBLIC_DD_VERSION="$SHORT_SHA" \
  -t "${IMAGE_URI}:${BUILD_TAG}" .

docker push "${IMAGE_URI}:${BUILD_TAG}"

# Get exact digest SHA for deterministic deploys
IMAGE_SHA=$(docker inspect --format='{{index .RepoDigests 0}}' "${IMAGE_URI}:${BUILD_TAG}")

# Generate k8s manifest with the exact SHA (forces new revision on every deploy)
# Then deploy:
gcloud run services replace k8s/cloudrun.yaml --region "$REGION" --project "$PROJECT_ID"
```

### Why use image SHA instead of tag?

Cloud Run caches images by tag. If you deploy `my-image:latest` twice, Cloud Run
may not create a new revision because the tag hasn't changed. Using the full
`@sha256:` digest forces a new revision on every deploy, even if only env vars changed.

## next.config.mjs

```javascript
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['dd-trace', '@google/genai'],
  productionBrowserSourceMaps: true,
  turbopack: {},  // silence Next.js 16 warning when webpack config is also present
  env: {
    NEXT_PUBLIC_DD_VERSION: process.env.DD_VERSION ?? '',
  },
};
export default nextConfig;
```

### Why `serverExternalPackages`?

dd-trace works by monkey-patching Node.js modules at runtime. If webpack bundles
dd-trace, the patches never apply. `serverExternalPackages` tells Next.js to leave
these as native `require()` calls. Also include any LLM client library (e.g.
`@google/genai`) that uses native Node.js features.

## Source Code Integration

Enable Datadog Source Code Integration with these env vars:

```yaml
- name: DD_GIT_COMMIT_SHA
  value: '__FULL_SHA__'
- name: DD_GIT_REPOSITORY_URL
  value: __GIT_REPO_URL__
```

Plus enable source maps in Dockerfile (`--enable-source-maps`) and
next.config.mjs (`productionBrowserSourceMaps: true`).
