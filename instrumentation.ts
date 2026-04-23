/**
 * Next.js instrumentation hook — runs once at server start before any routes load.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Initialises dd-trace with:
 *   - LLM Observability in-code setup
 *     https://docs.datadoghq.com/llm_observability/instrumentation/sdk/?tab=nodejs#in-code-setup
 *   - Server-side Feature Flags via the bundled Datadog OpenFeature provider
 *     https://docs.datadoghq.com/feature_flags/server/nodejs
 *
 * Important: do NOT combine this with NODE_OPTIONS="--require dd-trace/init".
 * In-code init and auto-init must not both run — this file is the single init point.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { default: tracer } = await import('dd-trace');
  const { OpenFeature } = await import('@openfeature/server-sdk');

  tracer.init({
    llmobs: {
      // Groups all LLM spans under this ML app name in Datadog LLM Observability.
      mlApp: process.env.DD_LLMOBS_ML_APP ?? process.env.DD_SERVICE,
      // agentlessEnabled: true → dd-trace sends LLM data directly to Datadog's
      // intake using DD_API_KEY. APM traces/metrics still go through serverless-init.
      agentlessEnabled: true,
    },
    experimental: {
      // Enables the Datadog Feature Flags provider wrapper around
      // @datadog/openfeature-node-server. Receives flag config via Remote
      // Configuration on the local trace-agent (bundled by serverless-init).
      flaggingProvider: { enabled: true },
    },
  });

  // Register the provider with OpenFeature so server code can call
  // OpenFeature.getClient().getBooleanValue(flagKey, defaultValue, context).
  // Intentionally fire-and-forget: requests that arrive before Remote Config
  // has loaded will receive the default value passed at the call site.
  OpenFeature.setProvider(tracer.openfeature);
}
