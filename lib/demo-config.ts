/**
 * Demo configuration driven by the DEMO_HIGH_LATENCY environment variable.
 *
 * Set DEMO_HIGH_LATENCY=true in Cloud Run environment variables to switch to
 * the high-latency demo mode. Remove or set to any other value to revert to
 * normal production settings.
 *
 * High-latency mode applies three techniques simultaneously:
 *  1. Heavier model (gemini-3.1-pro-preview instead of flash)
 *  2. Maximum thinking budget (24576 tokens = Gemini max)
 *  3. Verbose CoT prefix on every system prompt → forces multi-step reasoning
 */

export const DEMO_HIGH_LATENCY = process.env.DEMO_HIGH_LATENCY === 'true';

/**
 * When true, the merch checkout API throws a NullPointerException on the
 * THB currency handler, simulating a bug introduced in deployment v2.4.1.
 * This creates the APM error spike that triggers Bits AI investigation in Act 3.
 *
 * Toggle without redeploy:
 *   ./scripts/demo-pipeline.sh --error-inject-on
 *   ./scripts/demo-pipeline.sh --error-inject-off
 */
export const DEMO_ERROR_INJECT = process.env.DEMO_ERROR_INJECT === 'true';

/** Model to use depending on demo mode. */
export const LLM_MODEL = DEMO_HIGH_LATENCY
  ? 'gemini-3.1-pro-preview'   // heaviest model — $2/1M input, $12/1M output
  : 'gemini-3-flash-preview';  // normal production model

/** Thinking budget for Gemini thinkingConfig. */
export const THINKING_BUDGET = DEMO_HIGH_LATENCY
  ? 24576   // maximum thinking budget
  : 0;      // disable thinking for fastest response

/**
 * Verbose chain-of-thought system prefix injected when DEMO_HIGH_LATENCY=true.
 *
 * This forces the model to reason through every step explicitly before producing
 * output, significantly increasing response time and thinking token usage.
 * This is intentionally verbose for demo and observability showcase purposes.
 */
const COT_SYSTEM_PREFIX = `Before responding, reason through the following steps in your internal thinking:

STEP 1 — UNDERSTAND THE FULL CONTEXT
  • Re-read every piece of information provided.
  • Identify all named entities, their relationships, and any implicit connections.
  • Note anything surprising, unusual, or contradictory.

STEP 2 — IDENTIFY ALL RELEVANT FACTORS
  • List every factor that is relevant to the answer.
  • For each factor, assess its relative importance and potential interactions.
  • Do not skip minor factors — they may be decisive.

STEP 3 — REASON THROUGH MULTIPLE INTERPRETATIONS
  • Consider at least 3 different ways to interpret or approach the question.
  • Weigh the evidence for and against each interpretation.
  • Identify which interpretation is most defensible given all available information.

STEP 4 — CONSTRUCT YOUR ANSWER
  • Build your answer step-by-step from your analysis in steps 1–3.
  • Ensure internal consistency — no claim in your answer should contradict another.
  • Prioritise accuracy and insight over brevity.

STEP 5 — REVIEW
  • Re-read your answer and verify it addresses the original question fully.
  • Check for any logical gaps, missing information, or unsubstantiated claims.
  • Revise if necessary before finalising.

Only after completing all five steps should you produce your final response.

`;

/** Returns the system instruction with the CoT prefix prepended when in demo mode. */
export function buildSystemInstruction(base: string): string {
  return DEMO_HIGH_LATENCY ? COT_SYSTEM_PREFIX + base : base;
}
