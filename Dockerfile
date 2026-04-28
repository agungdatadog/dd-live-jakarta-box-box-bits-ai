FROM --platform=linux/amd64 node:22-bookworm-slim AS base
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

FROM --platform=linux/amd64 node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

# Required for Datadog serverless-init SSL on slim images
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy Datadog serverless-init entrypoint for APM tracing.
# This wraps the app process and flushes all traces/metrics on shutdown.
COPY --from=datadog/serverless-init:1 /datadog-init /app/datadog-init

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# dd-trace is loaded via instrumentation.ts (Next.js in-code init).
# Install it here so the standalone runtime resolves its transitive deps correctly.
RUN npm install --omit=dev --no-save dd-trace winston

EXPOSE 8080
# serverless-init wraps the app process and handles APM flushing on shutdown.
# dd-trace is initialised in-code via instrumentation.ts — do NOT set
# NODE_OPTIONS="--require dd-trace/init" alongside in-code init.
ENTRYPOINT ["/app/datadog-init"]
CMD ["node", "--enable-source-maps", "server.js"]
