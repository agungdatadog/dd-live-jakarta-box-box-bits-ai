'use client';

import {
  useBooleanFlagValue,
  useNumberFlagValue,
  useStringFlagValue,
} from '@openfeature/react-sdk';
import { FeatureFlags, FeatureFlagDefaults } from '@/lib/feature-flags';

/**
 * Evaluates every demo feature flag once on mount so each RUM session is
 * tagged with all flag variants, even before individual features wire them
 * into UI. Rendered once at the top of the app tree via FeatureFlagProvider.
 *
 * Evaluations are side-effect-free aside from the OpenFeature `after` hook
 * registered in FeatureFlagProvider, which forwards each evaluation to
 * datadogRum.addFeatureFlagEvaluation(). No DOM output.
 */
export default function FlagExposer() {
  useStringFlagValue(
    FeatureFlags.PITWALL_LLM_MODEL,
    FeatureFlagDefaults[FeatureFlags.PITWALL_LLM_MODEL],
  );
  useBooleanFlagValue(
    FeatureFlags.PITWALL_CHAT_ENABLED,
    FeatureFlagDefaults[FeatureFlags.PITWALL_CHAT_ENABLED],
  );
  useStringFlagValue(
    FeatureFlags.DREAM_TEAM_SYNERGY_ALGO,
    FeatureFlagDefaults[FeatureFlags.DREAM_TEAM_SYNERGY_ALGO],
  );
  useNumberFlagValue(
    FeatureFlags.QUIZ_QUESTION_COUNT,
    FeatureFlagDefaults[FeatureFlags.QUIZ_QUESTION_COUNT],
  );
  useStringFlagValue(
    FeatureFlags.UI_THEME,
    FeatureFlagDefaults[FeatureFlags.UI_THEME],
  );
  useBooleanFlagValue(
    FeatureFlags.HOME_3D_CAR_ENABLED,
    FeatureFlagDefaults[FeatureFlags.HOME_3D_CAR_ENABLED],
  );
  useBooleanFlagValue(
    FeatureFlags.NEW_PITWALL_UI,
    FeatureFlagDefaults[FeatureFlags.NEW_PITWALL_UI],
  );
  useBooleanFlagValue(
    FeatureFlags.AI_GUARD_STRICT_MODE,
    FeatureFlagDefaults[FeatureFlags.AI_GUARD_STRICT_MODE],
  );
  useBooleanFlagValue(
    FeatureFlags.DEMO_HIGH_LATENCY,
    FeatureFlagDefaults[FeatureFlags.DEMO_HIGH_LATENCY],
  );

  return null;
}
