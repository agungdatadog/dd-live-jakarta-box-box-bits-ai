'use client';

import { useEffect } from 'react';
import { useStringFlagValue } from '@openfeature/react-sdk';
import { FeatureFlags, FeatureFlagDefaults } from '@/lib/feature-flags';

const KNOWN_THEMES = ['midnight', 'hyper-race', 'datadog-purple'] as const;
type KnownTheme = (typeof KNOWN_THEMES)[number];

function isKnownTheme(value: string): value is KnownTheme {
  return (KNOWN_THEMES as readonly string[]).includes(value);
}

/**
 * Reads the `ui-theme` feature flag and sets `data-theme` on <html> so the
 * per-theme CSS variable blocks in globals.css take effect. Falls back to
 * the safe default (`midnight`) when the flag returns an unknown value.
 *
 * Rendered inside FeatureFlagProvider so it only runs on the client and
 * re-applies whenever the provider refreshes the flag (e.g. Datadog ships a
 * new variant to this session).
 */
export default function ThemeApplier() {
  const theme = useStringFlagValue(
    FeatureFlags.UI_THEME,
    FeatureFlagDefaults[FeatureFlags.UI_THEME],
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const applied = isKnownTheme(theme)
      ? theme
      : FeatureFlagDefaults[FeatureFlags.UI_THEME];
    document.documentElement.setAttribute('data-theme', applied);
  }, [theme]);

  return null;
}
