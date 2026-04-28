// dd-trace is initialised in-code via Next.js's instrumentation hook
// (see instrumentation.ts → tracer.init({...})). This file only re-exports
// the already-initialised tracer singleton for use by route handlers
// (custom spans, span tags, etc.).
//
// Configuration is read from DD_* environment variables:
//   DD_SERVICE, DD_ENV, DD_VERSION, DD_AGENT_HOST, DD_LOGS_INJECTION, ...
//
// Do NOT call tracer.init() here — that would cause a double-init.
import tracer from 'dd-trace';
export default tracer;
