# Structured Logging with Winston + Datadog

## Setup

```typescript
// lib/logger.ts
import winston, { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: {
    service: process.env.DD_SERVICE || 'my-service',
    env:     process.env.DD_ENV     || 'production',
    version: process.env.DD_VERSION || process.env.NEXT_PUBLIC_DD_VERSION || 'dev',
  },
  transports: [new transports.Console()],
});

export { logger };
```

## Dependencies

```bash
npm install winston
```

## Datadog integration

Set these environment variables in `service.yaml`:

```yaml
- name: DD_LOGS_ENABLED
  value: 'true'
- name: DD_LOGS_INJECTION
  value: 'true'
- name: DD_SOURCE
  value: nodejs
```

- `DD_LOGS_ENABLED`: enables log collection by serverless-init
- `DD_LOGS_INJECTION`: dd-trace automatically injects `dd.trace_id`, `dd.span_id`,
  `dd.service`, `dd.env`, `dd.version` into every log entry — linking logs to APM traces
- `DD_SOURCE`: sets the log source for Datadog log pipeline processing

## Usage patterns

### LLM evaluation with structured scoring

```typescript
logger.info({
  event_type: 'dream_team_game_evaluation',
  timestamp: new Date().toISOString(),
  game: 'datadog-live-jakarta-2026',
  user: { usr_id: userId, username },
  selection: { team_principal, driver_1, driver_2 },
  scoring: {
    base_stats: baseTeamStats,
    synergy_multiplier: llmResult.synergy_multiplier,
    final_score: finalScore,
    synergy_class: llmResult.synergy_class,
    weirdness_rating: llmResult.weirdness_rating,
    conflict_index: llmResult.conflict_index,
  },
  llm: {
    model: MODEL,
    latency_ms: latencyMs,
    input_chars: systemInstruction.length + userPrompt.length,
    output_chars: rawResponseText.length,
  },
  request: { path: '/api/evaluate-team' },
});
```

### Pitwall chat

```typescript
logger.info({
  event_type: 'pitwall_chat',
  timestamp: new Date().toISOString(),
  user: { usr_id: userId, username },
  llm: { model: MODEL, prompt_length: message?.length, reply_length: reply.length },
  request: { path: '/api/pitwall', sources_count: sources.length },
});
```

## JSON format

Winston's `format.json()` ensures each log entry is a single JSON object.
This is critical because:
- Datadog parses JSON logs automatically (no custom parsing rules needed)
- Multiline content stays in a single log event
- Structured fields are indexed and searchable in Datadog Log Explorer
- The `dd.trace_id` injected by DD_LOGS_INJECTION enables one-click
  navigation from a log line to the corresponding APM trace

## defaultMeta

Including `service`, `env`, and `version` in `defaultMeta` ensures these fields
are present on every log even if dd-trace's injection hasn't activated yet
(e.g. during startup). Once dd-trace is running, `DD_LOGS_INJECTION` adds the
trace correlation fields automatically.
