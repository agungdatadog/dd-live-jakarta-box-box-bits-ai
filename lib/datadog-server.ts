// Import the shared tracer singleton. lib/tracer.ts calls tracer.init()
// at import time so this is always the already-initialised instance.
import tracer from '@/lib/tracer';

type SpanLike = {
  setTag: (key: string, value: unknown) => void;
  finish: () => void;
};

type TracerLike = {
  startSpan: (name: string) => SpanLike;
  llmobs?: {
    trace?: (meta: { name: string; kind: string }, fn: (span: unknown) => Promise<unknown>) => Promise<unknown>;
    annotate?: (span: unknown, payload: Record<string, unknown>) => void;
  };
};

export default tracer as unknown as TracerLike;
