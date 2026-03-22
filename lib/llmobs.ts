/**
 * Helpers for Datadog LLM Observability span creation and annotation.
 *
 * Each LLM call gets a properly annotated span with:
 *  - inputData  : messages sent to the model
 *  - outputData : model response content
 *  - metrics    : token counts
 *  - metadata   : model name + any custom evaluation keys (weirdness_rating, etc.)
 *  - prompt     : structured prompt metadata for version tracking (dd-trace v5.83.0+)
 *
 * These fields are what Datadog's custom evaluator pipeline reads when you
 * run "Custom Evaluations" in LLM Observability.
 */
import tracer from '@/lib/datadog-server';

/** Chat message shape accepted by both inputData and prompt templates. */
export type ChatMessage = { role: string; content: string };

/**
 * Structured prompt metadata attached via llmobs.annotationContext.
 * See: https://docs.datadoghq.com/llm_observability/prompt_tracking/
 *
 * Omit `version` to enable auto-versioning (hash of template content).
 */
export interface LlmObsPrompt {
  /** Unique logical identifier for this prompt within the ml_app. */
  id: string;
  /**
   * Chat template as an array of messages with {{placeholder}} syntax.
   * Used by LLM Observability for version tracking and diff views.
   */
  template: ChatMessage[];
  /** Runtime values substituted into template placeholders. */
  variables?: Record<string, string>;
  /** Optional explicit version label — omit for automatic hash-based versioning. */
  version?: string;
  /** Arbitrary tags attached to each prompt run. */
  tags?: Record<string, string>;
  /**
   * Variable keys whose values are the user's question/query.
   * Used by LLM Observability hallucination detection.
   */
  queryVariables?: string[];
  /**
   * Variable keys whose values supply ground-truth context.
   * Used by LLM Observability hallucination detection.
   */
  contextVariables?: string[];
}

export interface LlmObsInput {
  /** Messages sent to the model — appears as inputData in the Datadog span. */
  inputMessages: ChatMessage[];
  /** Model name — stored in span metadata. */
  modelName?: string;
  /** Any extra metadata to attach to the span (user IDs, selection data, etc.). */
  metadata?: Record<string, string | number | boolean>;
  /**
   * Optional structured prompt metadata.
   * When provided, `llmobs.annotationContext` is used to attach it to the LLM
   * span, enabling prompt version tracking and diff views in the Datadog UI.
   */
  prompt?: LlmObsPrompt;
}

export interface LlmObsOutput {
  /** Full text of the model response. */
  outputContent: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Additional metadata to merge in after we have the response (e.g. computed scores). */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Wraps an async LLM call in a Datadog LLMObs span.
 *
 * When `input.prompt` is provided, the provider call (`fn`) is wrapped in
 * `llmobs.annotationContext` so the prompt metadata (id, template, variables)
 * is attached to the span for version tracking.
 *
 * Usage:
 *   const result = await withLlmObsSpan(
 *     'pitwall_chat',
 *     {
 *       inputMessages: [...],
 *       modelName: 'gemini-3-flash-preview',
 *       metadata: { userId },
 *       prompt: {
 *         id: 'pitwall-chat',
 *         template: [
 *           { role: 'system', content: SYSTEM_INSTRUCTION },
 *           { role: 'user',   content: '{{message}}' },
 *         ],
 *         variables: { message },
 *         queryVariables: ['message'],
 *       },
 *     },
 *     () => callGemini(prompt),
 *     (res) => ({ outputContent: res.text }),
 *   );
 */
export async function withLlmObsSpan<T>(
  spanName: string,
  input: LlmObsInput,
  fn: () => Promise<T>,
  getOutput?: (result: T) => LlmObsOutput,
): Promise<T> {
  const llmobs = (tracer as any)?.llmobs;

  if (!llmobs?.trace) {
    return fn();
  }

  return llmobs.trace({ name: spanName, kind: 'llm' }, async (span: unknown) => {
    // ── Annotate input before the LLM call ──────────────────────────────────
    if (llmobs.annotate) {
      try {
        llmobs.annotate(span, {
          inputData: input.inputMessages,
          metadata: { model: input.modelName ?? 'unknown', ...input.metadata },
        });
      } catch (_) { /* annotation best-effort */ }
    }

    // ── Execute the provider call ────────────────────────────────────────────
    // If a prompt is provided, wrap fn in annotationContext so LLM Observability
    // attaches the prompt metadata (template, variables, id) to this span.
    // This enables prompt version tracking and hallucination detection.
    const result: T = input.prompt && llmobs.annotationContext
      ? await llmobs.annotationContext({ prompt: input.prompt }, fn)
      : await fn();

    // ── Annotate output + metrics ────────────────────────────────────────────
    if (llmobs.annotate && getOutput) {
      try {
        const out = getOutput(result);
        const annotation: Record<string, unknown> = {
          outputData: [{ role: 'assistant', content: out.outputContent }],
          metadata: {
            model: input.modelName ?? 'unknown',
            ...input.metadata,
            ...out.metadata,
          },
        };
        if (out.inputTokens !== undefined || out.outputTokens !== undefined) {
          annotation.metrics = {
            inputTokens: out.inputTokens ?? 0,
            outputTokens: out.outputTokens ?? 0,
            totalTokens: (out.inputTokens ?? 0) + (out.outputTokens ?? 0),
          };
        }
        llmobs.annotate(span, annotation);
      } catch (_) { /* annotation best-effort */ }
    }

    return result;
  });
}
