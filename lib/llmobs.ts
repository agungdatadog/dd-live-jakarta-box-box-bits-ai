/**
 * Helpers for Datadog LLM Observability span creation and annotation.
 *
 * Each LLM call is annotated with:
 *  - inputData  : messages sent to the model
 *  - outputData : model response content
 *  - metrics    : token counts + computed USD cost
 *  - prompt     : structured prompt metadata for version tracking (dd-trace v5.83.0+)
 *
 * Cost is computed automatically from the model name and token counts using
 * the official Gemini API pricing table (https://ai.google.dev/gemini-api/docs/pricing).
 */
import tracer from '@/lib/datadog-server';

// ── Internal type for the dd-trace LLMObs SDK surface ────────────────────────
// dd-trace does not export its LLMObs types publicly; we define the minimal
// interface we rely on so the rest of the file remains strongly typed.
interface LlmObsTraceOptions {
  name: string;
  kind: string;
  modelName?: string;
  modelProvider?: string;
  sessionId?: string;
}
interface LlmObsAnnotation {
  inputData?: unknown;
  outputData?: unknown;
  metadata?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
}
interface LlmObsSDK {
  trace: <T>(options: LlmObsTraceOptions, fn: (span: unknown) => Promise<T>) => Promise<T>;
  annotate: (span: unknown, annotation: LlmObsAnnotation) => void;
  annotationContext?: <T>(ctx: { prompt: unknown }, fn: () => Promise<T>) => Promise<T>;
}

// ── Gemini pricing (USD per 1M tokens, paid tier, text/image/video) ──────────
// Source: https://ai.google.dev/gemini-api/docs/pricing  (retrieved 2026-03)
const GEMINI_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'gemini-3-flash-preview':        { inputPerM: 0.50,  outputPerM: 3.00  },
  'gemini-3.1-flash-lite-preview': { inputPerM: 0.25,  outputPerM: 1.50  },
  'gemini-3.1-pro-preview':        { inputPerM: 2.00,  outputPerM: 12.00 },
  'gemini-2.5-flash':              { inputPerM: 0.30,  outputPerM: 2.50  },
  'gemini-2.5-pro':                { inputPerM: 1.25,  outputPerM: 10.00 },
  'gemini-2.0-flash':              { inputPerM: 0.10,  outputPerM: 0.40  },
  'gemini-2.0-flash-lite':         { inputPerM: 0.075, outputPerM: 0.30  },
};

/** Returns input_cost, output_cost, total_cost in USD for a given call. */
function computeGeminiCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { inputCost: number; outputCost: number; totalCost: number } {
  const p = GEMINI_PRICING[model] ?? { inputPerM: 0.50, outputPerM: 3.00 };
  const inputCost  = (inputTokens  / 1_000_000) * p.inputPerM;
  const outputCost = (outputTokens / 1_000_000) * p.outputPerM;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** Chat message shape accepted by both inputData and prompt templates. */
export type ChatMessage = { role: string; content: string };

/**
 * Structured prompt metadata attached via llmobs.annotationContext.
 * Omit `version` to enable auto-versioning (hash of template content).
 * See: https://docs.datadoghq.com/llm_observability/prompt_tracking/
 */
export interface LlmObsPrompt {
  id: string;
  /** Chat template with {{placeholder}} syntax — used for version tracking. */
  template: ChatMessage[];
  variables?: Record<string, string>;
  version?: string;
  tags?: Record<string, string>;
  /** Variable keys containing the user query — used for hallucination detection. */
  queryVariables?: string[];
  /** Variable keys containing ground-truth context — used for hallucination detection. */
  contextVariables?: string[];
}

export interface LlmObsInput {
  inputMessages: ChatMessage[];
  /**
   * The name of the invoked LLM (e.g. 'gemini-3-flash-preview').
   * Passed directly to llmobs.trace() as modelName.
   */
  modelName?: string;
  /**
   * The model provider name (e.g. 'google', 'openai', 'anthropic').
   * Passed directly to llmobs.trace() as modelProvider.
   * Note: Datadog built-in cost estimates only activate for openai / azure_openai / anthropic;
   * we compute Google costs manually via computeGeminiCost().
   */
  modelProvider?: string;
  /**
   * The Datadog RUM session ID for the current user session.
   * Passed to llmobs.trace() as sessionId so LLMObs traces are linked to
   * the corresponding RUM session and Session Replay recording.
   */
  sessionId?: string;
  metadata?: Record<string, string | number | boolean>;
  prompt?: LlmObsPrompt;
}

export interface LlmObsOutput {
  outputContent: string;
  /** Actual token count from response.usageMetadata.promptTokenCount when available. */
  inputTokens?: number;
  /** Actual token count from response.usageMetadata.candidatesTokenCount when available. */
  outputTokens?: number;
  /** Additional metadata to merge post-call (e.g. computed evaluation scores). */
  metadata?: Record<string, string | number | boolean>;
}

// ── Main helper ───────────────────────────────────────────────────────────────

/**
 * Wraps an async LLM call in a Datadog LLMObs span with full annotation:
 *  - inputData / outputData
 *  - token counts + automatically computed USD cost metrics
 *  - prompt version tracking via annotationContext (when prompt is provided)
 *
 * Usage:
 *   const result = await withLlmObsSpan(
 *     'pitwall_chat',
 *     {
 *       inputMessages: [{ role: 'user', content: message }],
 *       modelName: 'gemini-3-flash-preview',
 *       metadata: { userId },
 *       prompt: { id: 'pitwall-chat', template: [...], variables: { message } },
 *     },
 *     () => callGemini(),
 *     (res) => ({
 *       outputContent: res.text ?? '',
 *       inputTokens:  res.usageMetadata?.promptTokenCount,
 *       outputTokens: res.usageMetadata?.candidatesTokenCount,
 *     }),
 *   );
 */
export async function withLlmObsSpan<T>(
  spanName: string,
  input: LlmObsInput,
  fn: () => Promise<T>,
  getOutput?: (result: T) => LlmObsOutput,
): Promise<T> {
  // dd-trace exposes llmobs on the tracer singleton; its type is not exported publicly.
  const llmobs: LlmObsSDK | undefined = (tracer as unknown as { llmobs?: LlmObsSDK })?.llmobs;

  if (!llmobs?.trace) {
    return fn();
  }

  return llmobs.trace(
    {
      name: spanName,
      kind: 'llm',
      // modelName and modelProvider surface in the LLMObs span details panel.
      modelName:     input.modelName    ?? 'custom',
      modelProvider: input.modelProvider ?? 'custom',
      // sessionId links this LLM span to the user's RUM session and Session Replay.
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    },
    async (span: unknown) => {
    // ── Annotate input ───────────────────────────────────────────────────────
    if (llmobs.annotate) {
      try {
        llmobs.annotate(span, {
          inputData: input.inputMessages,
          metadata: { model: input.modelName ?? 'unknown', ...input.metadata },
        });
      } catch (_) { /* annotation best-effort */ }
    }

    // ── Execute provider call (with prompt annotation context if provided) ───
    const result: T = input.prompt && llmobs.annotationContext
      ? await llmobs.annotationContext({ prompt: input.prompt }, fn)
      : await fn();

    // ── Annotate output + token metrics + USD cost ───────────────────────────
    if (llmobs.annotate && getOutput) {
      try {
        const out = getOutput(result);
        const inTok  = out.inputTokens  ?? 0;
        const outTok = out.outputTokens ?? 0;
        const { inputCost, outputCost, totalCost } = computeGeminiCost(
          input.modelName ?? '',
          inTok,
          outTok,
        );

        const annotation: Record<string, unknown> = {
          outputData: [{ role: 'assistant', content: out.outputContent }],
          metadata: {
            model: input.modelName ?? 'unknown',
            ...input.metadata,
            ...out.metadata,
          },
        };

        if (inTok || outTok) {
          annotation.metrics = {
            inputTokens:  inTok,
            outputTokens: outTok,
            totalTokens:  inTok + outTok,
            // USD cost — visible in Datadog LLM Observability cost views
            inputCost,
            outputCost,
            totalCost,
          };
        }

        llmobs.annotate(span, annotation);
      } catch (_) { /* annotation best-effort */ }
    }

    return result;
  }); // end llmobs.trace callback
}

