/**
 * Demo feature flags for Box Box Bits AI, resolved via Datadog Feature Flags
 * through the OpenFeature React SDK.
 *
 * Each flag is created in both the `prod` and `dev` environments in Datadog:
 * https://app.datadoghq.com/feature-flags
 *
 * Flag keys here MUST match the keys configured in Datadog.
 */

export const FeatureFlags = {
  /** STRING — Gemini model used on /pitwall. flash | pro */
  PITWALL_LLM_MODEL: 'pitwall-llm-model',
  /** BOOLEAN — kill-switch for the /pitwall route */
  PITWALL_CHAT_ENABLED: 'pitwall-chat-enabled',
  /** STRING — scoring algorithm for /dream-team. legacy | v2-weighted */
  DREAM_TEAM_SYNERGY_ALGO: 'dream-team-synergy-algo',
  /** INTEGER — how many quiz questions on /quiz. 5 | 10 | 15 */
  QUIZ_QUESTION_COUNT: 'quiz-question-count',
  /** STRING — global UI theme. midnight | hyper-race | datadog-purple */
  UI_THEME: 'ui-theme',
  /** BOOLEAN — toggle the heavy 3D WebGL car on the home page */
  HOME_3D_CAR_ENABLED: 'home-3d-car-enabled',
  /** BOOLEAN — canary rollout of the redesigned Pitwall chat UI */
  NEW_PITWALL_UI: 'new-pitwall-ui',
  /** BOOLEAN — AI Guard behaviour. true = strict/block, false = monitor */
  AI_GUARD_STRICT_MODE: 'ai-guard-strict-mode',
  /** BOOLEAN — client-side twin of DEMO_HIGH_LATENCY server env var */
  DEMO_HIGH_LATENCY: 'demo-high-latency',
} as const;

export type FeatureFlagKey = (typeof FeatureFlags)[keyof typeof FeatureFlags];

/**
 * Safe defaults used when the flag backend is unreachable. These should
 * mirror the "off" / current-behaviour variant of each flag so the app
 * keeps working if Datadog is down.
 */
export const FeatureFlagDefaults = {
  [FeatureFlags.PITWALL_LLM_MODEL]: 'gemini-3-flash-preview',
  [FeatureFlags.PITWALL_CHAT_ENABLED]: true,
  [FeatureFlags.DREAM_TEAM_SYNERGY_ALGO]: 'legacy',
  [FeatureFlags.QUIZ_QUESTION_COUNT]: 10,
  [FeatureFlags.UI_THEME]: 'midnight',
  [FeatureFlags.HOME_3D_CAR_ENABLED]: true,
  [FeatureFlags.NEW_PITWALL_UI]: false,
  [FeatureFlags.AI_GUARD_STRICT_MODE]: false,
  [FeatureFlags.DEMO_HIGH_LATENCY]: false,
} as const;
