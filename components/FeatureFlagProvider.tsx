'use client';

import { useEffect, useState } from 'react';
import { datadogRum } from '@datadog/browser-rum';
import { DatadogProvider } from '@datadog/openfeature-browser';
import { OpenFeatureProvider } from '@openfeature/react-sdk';
import { OpenFeature } from '@openfeature/web-sdk';
import { useUserStore } from '@/store/userStore';

// Flag env must match one of the environment.queries values configured in
// Datadog Feature Flags (prod | dev). NEXT_PUBLIC_DATADOG_ENV is "production"
// in Cloud Run (matches RUM convention), so we coerce to the flag env key.
const RUM_ENV = process.env.NEXT_PUBLIC_DATADOG_ENV || 'production';
const FLAG_ENV = RUM_ENV === 'production' ? 'prod' : RUM_ENV;
const FLAG_SERVICE =
  process.env.NEXT_PUBLIC_DATADOG_SERVICE || 'box-box-bits-ai-frontend';

/**
 * Initialises the Datadog OpenFeature provider and wraps the app in an
 * OpenFeatureProvider so components can call useBooleanFlagValue / etc.
 *
 * Datadog wiring (all three intakes are enabled for full observability):
 *   - enableRumFeatureFlagTracking: pins every evaluation onto the active
 *     RUM session (Feature Flag Tracking tab, per-session Feature Flags).
 *   - enableFlagEvaluationTracking:  streams evaluation counts (per flag
 *     per variant) to the flag evaluation intake at a fixed interval.
 *   - enableExposureLogging:         records individual exposures for
 *     canary/experiment analysis on the exposures intake.
 *
 * The OpenFeatureProvider renders immediately with the default NOOP
 * provider. Components get their safe default values from
 * useXxxFlagValue(..., default) until DatadogProvider finishes
 * initialising, so flag outages never block time-to-interactive.
 */
export default function FeatureFlagProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, username, hasSetName } = useUserStore();
  const [isProviderReady, setIsProviderReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applicationId = process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID;
    const clientToken = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;

    if (!applicationId || !clientToken) {
      console.warn(
        '[feature-flags] skipping init: missing NEXT_PUBLIC_DATADOG_APPLICATION_ID or NEXT_PUBLIC_DATADOG_CLIENT_TOKEN',
      );
      return;
    }

    const site = process.env.NEXT_PUBLIC_DATADOG_SITE || 'datadoghq.com';

    let cancelled = false;

    (async () => {
      try {
        await OpenFeature.setContext({
          targetingKey: 'anonymous',
          env: FLAG_ENV,
          service: FLAG_SERVICE,
        });

        const provider = new DatadogProvider({
          applicationId,
          clientToken,
          site,
          env: FLAG_ENV,
          service: FLAG_SERVICE,
          version: process.env.NEXT_PUBLIC_DD_VERSION || 'dev',
          enableRumFeatureFlagTracking: true,
          enableFlagEvaluationTracking: true,
          enableExposureLogging: true,
        });

        await OpenFeature.setProviderAndWait(provider);
      } catch (err) {
        console.error('[feature-flags] init failed:', err);
        if (datadogRum.getInitConfiguration()) {
          datadogRum.addError(err);
        }
      } finally {
        if (!cancelled) setIsProviderReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isProviderReady) return;
    if (!userId) return;
    OpenFeature.setContext({
      targetingKey: userId,
      username: hasSetName ? username : 'GuestDoggo',
      env: FLAG_ENV,
      service: FLAG_SERVICE,
    }).catch((err) => {
      console.warn('[feature-flags] context update failed:', err);
    });
  }, [isProviderReady, userId, username, hasSetName]);

  return (
    <OpenFeatureProvider client={OpenFeature.getClient()}>
      {children}
    </OpenFeatureProvider>
  );
}
