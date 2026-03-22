---
name: datadog-nextjs-observability
description: >
  Integrate Datadog APM, RUM, LLM Observability, and structured logging into
  Node.js (Next.js) applications deployed as containers on Google Cloud Run.
  Use when the user wants to: (1) add Datadog tracing / APM to a Next.js
  Cloud Run container using the in-container serverless-init method,
  (2) add Datadog RUM (Real User Monitoring) to a React/Next.js frontend,
  (3) add Datadog LLM Observability for Node.js with the in-code SDK setup,
  (4) correlate APM, RUM, and LLMObs traces together,
  (5) set up structured logging with winston + DD_LOGS_INJECTION,
  (6) configure Dockerfile, service.yaml, deploy.sh, or next.config.mjs for
  Datadog integration, (7) enable Datadog Source Code Integration with
  DD_GIT_* env vars, (8) troubleshoot dd-trace, serverless-init, or
  NEXT_PUBLIC_* build-time vs runtime issues in Next.js,
  (9) add LLMObs prompt tracking for version diff and hallucination detection,
  or (10) annotate LLM cost metrics for Google Gemini models.
---

# Datadog Next.js Observability

End-to-end guide for instrumenting a Next.js (App Router) application with
Datadog APM, RUM, LLM Observability, and structured logging, deployed as a
container on Google Cloud Run using the **in-container** method.

## Architecture Overview

```
Browser (RUM SDK)
  ├─ allowedTracingUrls → injects trace-context headers into /api/* fetches
  ├─ datadogRum.getInternalContext().session_id → passed in request body
  └─ datadogRum.setUser({ id, name }) for user identification
      │
      ▼
Cloud Run container (single container — NOT sidecar)
  ├─ ENTRYPOINT ["/app/datadog-init"]  ← datadog/serverless-init:1
  │    └─ wraps the app process; flushes traces on shutdown
  ├─ dd-trace (in-code init via instrumentation.ts)
  │    ├─ APM spans   → Datadog Agent intake (via serverless-init on localhost:8126)
  │    └─ LLMObs spans → Datadog LLMObs intake (agentless, direct via DD_API_KEY)
  ├─ winston logger  (JSON, DD_LOGS_INJECTION auto-enriches with trace IDs)
  └─ CMD ["node", "--enable-source-maps", "server.js"]
```

### Why in-container, not sidecar?

With the sidecar pattern (separate `datadog-agent` container), `dd-trace` in the
app container sends traces to `localhost:8126` — but Cloud Run's multi-container
networking does not always bridge that port reliably. With in-container
`serverless-init`, the Datadog Agent process runs **inside the same container**
as the app, so `localhost:8126` is guaranteed reachable.

## Key Files Checklist

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build; `serverless-init` ENTRYPOINT; dd-trace install; source maps |
| `service.yaml` | Cloud Run YAML with DD_* env vars (DD_API_KEY on the app container) |
| `deploy.sh` | Build, push, render service.yaml placeholders, deploy |
| `next.config.mjs` | `serverExternalPackages`, `productionBrowserSourceMaps`, `NEXT_PUBLIC_DD_VERSION` |
| `instrumentation.ts` | In-code dd-trace + LLMObs init (Next.js `register()` hook) |
| `lib/llmobs.ts` | `withLlmObsSpan()` helper — wraps LLM calls with full annotation + cost |
| `lib/logger.ts` | Winston JSON logger with console + file transport |
| `lib/datadog-client.ts` | Client-side RUM init with `allowedTracingUrls` |
| `components/DatadogInit.tsx` | `'use client'` component for RUM init + user tagging |

## Workflow

### 1. APM + Container Setup

See [references/apm-container.md](references/apm-container.md) for:
- Dockerfile multi-stage build with `datadog/serverless-init:1` ENTRYPOINT
- `service.yaml` DD_* environment variables (single container, DD_API_KEY on app)
- `deploy.sh` build-arg and placeholder patterns
- `next.config.mjs` configuration for dd-trace compatibility

### 2. LLM Observability

See [references/llmobs.md](references/llmobs.md) for:
- In-code dd-trace init via `instrumentation.ts` (Next.js `register()`)
- `withLlmObsSpan()` helper with `modelName`, `modelProvider`, `sessionId`
- `llmobs.annotate()` for input/output data, metadata, metrics, and **prompt tracking**
- Prompt tracking with `annotate({ prompt })` on manually-created spans
- Google Gemini cost annotation (inputCost, outputCost, totalCost in USD)
- Task spans for evaluation targeting

### 3. RUM + Correlation

See [references/rum.md](references/rum.md) for:
- `@datadog/browser-rum` initialization in a client component
- `allowedTracingUrls` for APM-RUM trace correlation
- `datadogRum.setUser()` and `setGlobalContextProperty()` for user/team tagging
- RUM session ID propagation to LLMObs via `getInternalContext().session_id`
- Custom actions (`datadogRum.addAction()`) for game/event telemetry

### 4. Structured Logging

See [references/logging.md](references/logging.md) for:
- Winston logger with JSON format
- `DD_LOGS_INJECTION=true` for automatic trace ID enrichment
- Log correlation with APM traces in Datadog

## Critical Gotchas

1. **Never combine `NODE_OPTIONS="--require dd-trace/init"` with in-code init.**
   Use one or the other. For Next.js App Router, use in-code init via `instrumentation.ts`.
   If both are active, dd-trace initializes twice and the second init silently fails.

2. **In-container, not sidecar.** Use `ENTRYPOINT ["/app/datadog-init"]` with
   `COPY --from=datadog/serverless-init:1 /datadog-init /app/datadog-init` in the
   Dockerfile. Do NOT deploy a separate `datadog-agent` sidecar container — the
   multi-container networking in Cloud Run does not reliably bridge `localhost:8126`.

3. **DD_API_KEY must be on the app container**, not a sidecar. The app container
   runs `serverless-init` which needs the API key to forward traces. LLMObs with
   `agentlessEnabled: true` also uses the API key directly.

4. **`NEXT_PUBLIC_*` variables must be available at `next build` time**, not just
   Cloud Run runtime. Pass them as Docker `--build-arg` and set `ARG`/`ENV` in the
   builder stage of the Dockerfile before `npm run build`.

5. **`serverExternalPackages: ['dd-trace']`** is required in `next.config.mjs`.
   Without it, webpack bundles dd-trace and breaks runtime monkey-patching.

6. **dd-trace must be installed separately in the runner stage** with
   `RUN npm install --no-save dd-trace` because Next.js standalone output
   doesn't include it and its native deps (dc-polyfill, @datadog/pprof).

7. **`ca-certificates` is required** in `node:22-slim` based runner images for
   `serverless-init` SSL connections: `apt-get install -y ca-certificates`.

8. **Quote all-digit git SHAs in YAML** — a short SHA like `6160312` is parsed
   as an integer by YAML, causing Cloud Run deployment to fail. Always quote:
   `value: '__SHORT_SHA__'`

9. **Prompt tracking: use `annotate()`, NOT `annotationContext()`** for
   manually-created spans (our `llmobs.trace()` approach). `annotationContext()`
   only works for auto-instrumented providers (openai, anthropic). See llmobs.md.

10. **`--enable-source-maps`** in the Node.js CMD enables TypeScript source map
    resolution for APM error stack traces and Datadog Error Tracking.

11. **`agentlessEnabled: true`** in llmobs config sends LLM data directly to
    Datadog intake using DD_API_KEY. APM traces still go through serverless-init.

12. **Gemini model names matter.** `gemini-2.0-flash-lite` is deprecated (shutdown
    June 2026). Use `gemini-3-flash-preview` (main) and `gemini-3.1-flash-lite-preview`
    (light tasks). Check https://ai.google.dev/gemini-api/docs/pricing for current models.
