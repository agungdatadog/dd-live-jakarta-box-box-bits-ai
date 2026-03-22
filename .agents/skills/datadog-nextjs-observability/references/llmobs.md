# LLM Observability for Next.js (In-Code SDK Setup)

## Table of Contents

- [Initialization](#initialization)
- [withLlmObsSpan helper](#withlllmobsspan-helper)
- [Span options: modelName, modelProvider, sessionId](#span-options)
- [Enriching spans with annotate](#enriching-spans)
- [Prompt tracking (IMPORTANT: annotate, NOT annotationContext)](#prompt-tracking)
- [Cost annotation for Google Gemini](#cost-annotation)
- [Task spans for evaluation](#task-spans-for-evaluation)
- [Complete example: pitwall chat](#complete-example-pitwall-chat)
- [Complete example: game evaluation with hidden scoring](#complete-example-game-evaluation)

## Initialization

Use the Next.js `register()` instrumentation hook to initialize dd-trace
with LLMObs. This runs once at server start before any routes load.

```typescript
// instrumentation.ts (project root, or src/instrumentation.ts if using src/)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { default: tracer } = await import("dd-trace");
    tracer.init({
      llmobs: {
        mlApp: process.env.DD_LLMOBS_ML_APP ?? process.env.DD_SERVICE,
        agentlessEnabled: true,  // sends LLM data directly via DD_API_KEY
      },
    });
  }
}
```

**Critical**: Never combine this with `NODE_OPTIONS="--require dd-trace/init"`.
In-code init and auto-init must not both run.

## withLlmObsSpan helper

Create a reusable helper that wraps any LLM call in a properly annotated span:

```typescript
// lib/llmobs.ts
import tracer from '@/lib/datadog-server';

interface LlmObsSDK {
  trace: <T>(options: LlmObsTraceOptions, fn: (span: unknown) => Promise<T>) => Promise<T>;
  annotate: (span: unknown, annotation: LlmObsAnnotation) => void;
}

export async function withLlmObsSpan<T>(
  spanName: string,
  input: LlmObsInput,
  fn: () => Promise<T>,
  getOutput?: (result: T) => LlmObsOutput,
): Promise<T> {
  const llmobs = (tracer as unknown as { llmobs?: LlmObsSDK })?.llmobs;
  if (!llmobs?.trace) return fn();

  return llmobs.trace(
    {
      name: spanName,
      kind: 'llm',
      modelName:     input.modelName    ?? 'custom',
      modelProvider: input.modelProvider ?? 'custom',
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    },
    async (span: unknown) => {
      // Annotate input + prompt BEFORE the LLM call
      llmobs.annotate(span, {
        inputData: input.inputMessages,
        metadata: { model: input.modelName ?? 'unknown', ...input.metadata },
        ...(input.prompt ? { prompt: input.prompt } : {}),
      });

      const result = await fn();

      // Annotate output + metrics AFTER the LLM call
      if (getOutput) {
        const out = getOutput(result);
        llmobs.annotate(span, {
          outputData: [{ role: 'assistant', content: out.outputContent }],
          metadata: { ...input.metadata, ...out.metadata },
          metrics: {
            inputTokens:  out.inputTokens ?? 0,
            outputTokens: out.outputTokens ?? 0,
            totalTokens:  (out.inputTokens ?? 0) + (out.outputTokens ?? 0),
            inputCost, outputCost, totalCost,  // USD cost from pricing table
          },
        });
      }

      return result;
    }
  );
}
```

## Span options

When creating an LLM span, always set these three fields:

```typescript
llmobs.trace({
  name: 'pitwall_chat',
  kind: 'llm',
  modelName:     'gemini-3-flash-preview',  // appears in span details
  modelProvider: 'google',                   // groups spans by provider
  sessionId:     rumSessionId,               // links to RUM session & replay
}, async (span) => { ... });
```

- `modelName` — the exact Gemini model identifier
- `modelProvider` — set to `'google'` for Gemini (Datadog built-in cost is only
  for openai/azure_openai/anthropic; use manual cost annotation for Google)
- `sessionId` — the RUM session ID from `datadogRum.getInternalContext()?.session_id`

## Enriching spans

Use `llmobs.annotate()` inside a traced span. Call it twice: once for input
(before the LLM call) and once for output (after):

```typescript
// BEFORE the LLM call
llmobs.annotate(span, {
  inputData: [
    { role: 'system', content: systemInstruction },
    { role: 'user',   content: userMessage },
  ],
  metadata: { userId, model: 'gemini-3-flash-preview' },
});

// AFTER the LLM call
llmobs.annotate(span, {
  outputData: [{ role: 'assistant', content: response.text }],
  metrics: {
    inputTokens:  response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens:  (inputTokens + outputTokens),
    inputCost:    0.00025,  // computed from pricing table
    outputCost:   0.00150,
    totalCost:    0.00175,
  },
});
```

## Prompt tracking

### IMPORTANT: Use `annotate()`, NOT `annotationContext()`

`annotationContext()` is for **auto-instrumented** providers (openai, anthropic)
where dd-trace creates child spans automatically. For **manually-created** spans
(our `llmobs.trace()` approach with Gemini), the prompt must be passed directly
to `llmobs.annotate()`:

```typescript
// ✅ CORRECT — prompt attached to the manually-created span:
llmobs.annotate(span, {
  inputData: input.inputMessages,
  prompt: {
    id: 'pitwall-chat',
    template: [
      { role: 'system', content: 'You are Bits AI...' },
      { role: 'user',   content: '{{message}}' },
    ],
    variables: { message: userMessage },
    queryVariables: ['message'],  // for hallucination detection
    tags: { game: 'datadog-live-bangkok-2026' },
    // version: omitted → auto-versioned by hash of template content
  },
});

// ❌ WRONG — annotationContext only works with auto-instrumented providers:
// await llmobs.annotationContext({ prompt: ... }, fn);
// This silently drops the prompt metadata for non-instrumented providers.
```

### Prompt schema

```typescript
interface LlmObsPrompt {
  id: string;           // unique per ml_app
  template: ChatMessage[];  // with {{placeholder}} syntax
  variables?: Record<string, string>;
  version?: string;     // omit for auto-versioning by template hash
  tags?: Record<string, string>;
  queryVariables?: string[];     // keys containing user query
  contextVariables?: string[];   // keys containing ground-truth context
}
```

### Version tracking

- **Omit `version`** → Datadog auto-generates a version by hashing the template
  content. Any template edit creates a new version automatically.
- **Provide `version`** → Datadog uses your label exactly as given.

## Cost annotation

Datadog's built-in cost estimates only work for `openai`, `azure_openai`, and
`anthropic`. For Google Gemini, compute costs manually using the pricing table:

```typescript
// Gemini pricing (USD per 1M tokens, paid tier, text)
// Source: https://ai.google.dev/gemini-api/docs/pricing
const GEMINI_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'gemini-3-flash-preview':        { inputPerM: 0.50,  outputPerM: 3.00  },
  'gemini-3.1-flash-lite-preview': { inputPerM: 0.25,  outputPerM: 1.50  },
  'gemini-3.1-pro-preview':        { inputPerM: 2.00,  outputPerM: 12.00 },
  'gemini-2.5-flash':              { inputPerM: 0.30,  outputPerM: 2.50  },
  'gemini-2.5-pro':                { inputPerM: 1.25,  outputPerM: 10.00 },
};

function computeGeminiCost(model: string, inputTokens: number, outputTokens: number) {
  const p = GEMINI_PRICING[model] ?? { inputPerM: 0.50, outputPerM: 3.00 };
  const inputCost  = (inputTokens  / 1_000_000) * p.inputPerM;
  const outputCost = (outputTokens / 1_000_000) * p.outputPerM;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}
```

Use `response.usageMetadata.promptTokenCount` and `candidatesTokenCount` from
the Gemini API response for actual token counts instead of character estimates.

## Task spans for evaluation

Wrap logical operations in `task` spans to target them with Datadog
Evaluations (quality scoring, safety checks, etc.):

```typescript
llmobs.trace(
  { kind: 'task', name: 'dream_team_game_evaluation', sessionId },
  async (span) => {
    llmobs.annotate(span, {
      inputData: [...],
      metadata: { userId, weirdness_rating: 85, conflict_index: 92 },
      tags: { game: 'datadog-live-bangkok-2026' },
    });
    await runLLMSpan();
    llmobs.annotate(span, { outputData: capturedResponse });
  }
);
```

## Complete example: pitwall chat

```typescript
// app/api/pitwall/route.ts
const MODEL = 'gemini-3-flash-preview';
const SYSTEM_INSTRUCTION = 'You are Bits AI, the Datadog mascot...';

const response = await withLlmObsSpan(
  'pitwall_chat',
  {
    inputMessages: [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user',   content: message },
    ],
    modelName:     MODEL,
    modelProvider: 'google',
    sessionId:     sessionId ?? '',
    metadata: { userId, username },
    prompt: {
      id: 'pitwall-chat',
      template: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user',   content: '{{message}}' },
      ],
      variables: { message },
      tags: { game: 'datadog-live-bangkok-2026' },
      queryVariables: ['message'],
    },
  },
  async () => {
    const chat = ai.chats.create({
      model: MODEL,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 0 },  // faster responses
      },
    });
    return chat.sendMessage({ message });
  },
  (res) => ({
    outputContent: res.text ?? '',
    inputTokens:  res.usageMetadata?.promptTokenCount,
    outputTokens: res.usageMetadata?.candidatesTokenCount,
  }),
);
```

## Complete example: game evaluation

Pattern where the LLM scores multiple dimensions but only a glimpse is shown
to the user; full scores are logged to LLMObs for Datadog custom evaluations:

```typescript
const response = await withLlmObsSpan(
  'dream_team_game_evaluation',
  {
    inputMessages: [
      { role: 'system', content: systemInstruction },
      { role: 'user',   content: userPrompt },  // includes all 50 characters as context
    ],
    modelName:     'gemini-3-flash-preview',
    modelProvider: 'google',
    sessionId,
    metadata: { userId, username, base_stats: baseTeamStats },
  },
  () => ai.models.generateContent({ model, contents: [...], config: { responseMimeType: 'application/json' } }),
  (res) => ({
    outputContent: res.text ?? '',
    inputTokens:  res.usageMetadata?.promptTokenCount,
    outputTokens: res.usageMetadata?.candidatesTokenCount,
    metadata: {
      // Hidden from UI — only in LLMObs for custom evaluations
      weirdness_rating: llmResult.weirdness_rating,
      conflict_index:   llmResult.conflict_index,
      synergy_class:    llmResult.synergy_class,
      final_score:      finalScore,
    },
  }),
);

// UI gets: teamCodename, sneakPeek, synergyClass, finalScore
// Datadog gets: ALL of the above + weirdness_rating + conflict_index
```
