import { OpenFeature, type EvaluationContext } from '@openfeature/server-sdk';
import { FeatureFlags, FeatureFlagDefaults } from '@/lib/feature-flags';

/**
 * Server-side feature flag evaluation via the Datadog OpenFeature provider
 * registered in instrumentation.ts. Reads the same flag definitions as the
 * client (lib/feature-flags.ts) but evaluates them on the server so
 * security-sensitive behaviour (e.g. AI Guard block mode) cannot be spoofed
 * from the browser.
 */

/** Build an OpenFeature EvaluationContext from common request fields. */
export function buildFlagContext(params: {
  userId?: string | null;
  username?: string | null;
}): EvaluationContext {
  return {
    targetingKey: params.userId || 'anonymous',
    username: params.username || 'GuestDoggo',
    env:
      (process.env.DD_ENV && process.env.DD_ENV === 'prod') ? 'prod'
        : process.env.DD_ENV === 'production' ? 'prod'
          : process.env.DD_ENV || 'prod',
    service: process.env.DD_SERVICE || 'box-box-bits-ai',
  };
}

/**
 * Resolves the AI Guard strict-mode flag. Returns true when AI Guard should
 * reject requests (DENY/ABORT → 403), false for monitor-only.
 *
 * Resolution order:
 *   1. `ai-guard-strict-mode` feature flag (Datadog, evaluated per request).
 *   2. `DD_AI_GUARD_BLOCK=true` env var (legacy fallback).
 *   3. FeatureFlagDefaults (false, monitor-only).
 */
export async function resolveAiGuardStrict(
  ctx: EvaluationContext,
): Promise<boolean> {
  const envFallback =
    process.env.DD_AI_GUARD_BLOCK === 'true'
      ? true
      : FeatureFlagDefaults[FeatureFlags.AI_GUARD_STRICT_MODE];

  try {
    const client = OpenFeature.getClient();
    return await client.getBooleanValue(
      FeatureFlags.AI_GUARD_STRICT_MODE,
      envFallback,
      ctx,
    );
  } catch {
    return envFallback;
  }
}
