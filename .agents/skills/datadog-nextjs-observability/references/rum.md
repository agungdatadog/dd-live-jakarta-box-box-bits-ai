# Datadog RUM for Next.js + APM/LLMObs Correlation

## Table of Contents

- [Installation](#installation)
- [RUM initialization (dedicated component)](#rum-initialization)
- [APM-RUM correlation](#apm-rum-correlation)
- [User identification](#user-identification)
- [Global context properties](#global-context-properties)
- [Custom actions for game/event telemetry](#custom-actions)
- [RUM-LLMObs correlation via sessionId](#rum-llmobs-correlation)
- [Build version display](#build-version-display)

## Installation

```bash
npm install @datadog/browser-rum
```

## RUM initialization

Create a dedicated `'use client'` component for RUM initialization.
Import it in your root layout so it runs on every page:

```typescript
// components/DatadogInit.tsx
'use client';
import { useEffect } from 'react';
import { datadogRum } from '@datadog/browser-rum';
import { useUserStore } from '@/store/userStore';

export default function DatadogInit() {
  const { userId, username, initialize } = useUserStore();

  useEffect(() => {
    if (typeof window !== 'undefined' && !datadogRum.getInitConfiguration()) {
      datadogRum.init({
        applicationId: process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID!,
        clientToken:   process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN!,
        site:    process.env.NEXT_PUBLIC_DATADOG_SITE    || 'datadoghq.com',
        service: process.env.NEXT_PUBLIC_DATADOG_SERVICE || 'my-service',
        env:     process.env.NEXT_PUBLIC_DATADOG_ENV     || 'production',
        version: process.env.NEXT_PUBLIC_DD_VERSION      || 'dev',
        sessionSampleRate: 100,
        sessionReplaySampleRate: 100,
        trackBfcacheViews: true,
        trackResources: true,
        trackLongTasks: true,
        trackUserInteractions: true,
        defaultPrivacyLevel: 'allow',
        allowedTracingUrls: [
          (url: string) => url.startsWith(`${window.location.origin}/api/`),
        ],
      });
      datadogRum.startSessionReplayRecording();
    }
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (userId) {
      datadogRum.setUser({ id: userId, name: username });
      datadogRum.setGlobalContextProperty('usr.id', userId);
      datadogRum.setGlobalContextProperty('usr.name', username);
    }
  }, [userId, username]);

  return null;
}
```

```typescript
// app/layout.tsx
import DatadogInit from '@/components/DatadogInit';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <DatadogInit />
        {children}
      </body>
    </html>
  );
}
```

### Configuration notes

- All `NEXT_PUBLIC_DATADOG_*` env vars must be set at **build time** (Docker `--build-arg`)
- `sessionSampleRate: 100` captures all sessions (adjust for high-traffic production)
- `defaultPrivacyLevel: 'allow'` enables session replay text capture
- `startSessionReplayRecording()` begins capturing the session replay immediately

## APM-RUM correlation

`allowedTracingUrls` tells the RUM SDK to inject Datadog/W3C trace-context
headers into matching requests. This links frontend resource spans to backend
APM traces in the Datadog UI:

```typescript
allowedTracingUrls: [
  (url: string) => url.startsWith(`${window.location.origin}/api/`),
],
```

## User identification

Set the RUM user so sessions are searchable by `usr.id` in RUM Explorer:

```typescript
datadogRum.setUser({
  id: userId,   // unique identifier
  name: username, // display name
});
```

This is typically called after the user sets their name (e.g. DriverNameGate).

## Global context properties

Add custom properties to ALL RUM events for filtering:

```typescript
datadogRum.setGlobalContextProperty('app.name', 'box-box-bits-ai');
datadogRum.setGlobalContextProperty('app.version', process.env.NEXT_PUBLIC_DD_VERSION);
datadogRum.setGlobalContextProperty('usr.id', userId);
datadogRum.setGlobalContextProperty('usr.name', username);
```

## Custom actions

Use `datadogRum.addAction()` to emit named events visible in RUM Explorer
and Session Replay timeline:

```typescript
// Track game submissions with structured context
datadogRum.addAction('dream_team_submitted', {
  userId,
  username,
  base_score: baseScore,
  selection: {
    principal: selectedPrincipal.name,
    driver_1: selectedDriver.name,
  },
});

// Track AI name generation
datadogRum.addAction('driver_name_set', {
  driver_name: name,
  ai_generated: true,
});

// Track game results
datadogRum.addAction('dream_team_result', {
  final_score: result.finalScore,
  synergy_class: result.synergyClass,
  team_codename: result.teamCodename,
});
```

## RUM-LLMObs correlation

To link RUM sessions with LLM Observability spans:

1. **Client side**: read the RUM session ID:
```typescript
const sessionId = datadogRum.getInternalContext()?.session_id ?? '';
```

2. **Include in every API request body**:
```typescript
await fetch('/api/pitwall', {
  method: 'POST',
  body: JSON.stringify({
    message,
    userId,
    username,
    sessionId: datadogRum.getInternalContext()?.session_id ?? '',
  }),
});
```

3. **Server side**: pass `sessionId` to `withLlmObsSpan`:
```typescript
const response = await withLlmObsSpan(
  'pitwall_chat',
  {
    inputMessages: [...],
    modelName:     'gemini-3-flash-preview',
    modelProvider: 'google',
    sessionId:     sessionId ?? '',
    // ...
  },
  () => callGemini(),
);
```

This links the LLM span to the RUM session — you can click from an LLM trace
directly into the Session Replay recording of that user's session.

## Build version display

1. **next.config.mjs**: bake git SHA into client bundle:
```javascript
env: {
  NEXT_PUBLIC_DD_VERSION: process.env.DD_VERSION ?? '',
},
```

2. **Dockerfile builder stage**: pass as build-arg:
```dockerfile
ARG NEXT_PUBLIC_DD_VERSION
ENV NEXT_PUBLIC_DD_VERSION=$NEXT_PUBLIC_DD_VERSION
```

3. **deploy.sh**: supply the arg:
```bash
docker build --build-arg NEXT_PUBLIC_DD_VERSION="$SHORT_SHA" ...
```
