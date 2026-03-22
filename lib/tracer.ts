// dd-trace is pre-initialized via NODE_OPTIONS="--require dd-trace/init".
// All configuration is read from DD_* environment variables:
//   DD_SERVICE, DD_ENV, DD_VERSION, DD_AGENT_HOST, DD_LOGS_INJECTION, etc.
// This file only re-exports the already-initialized tracer singleton.
// Do NOT call tracer.init() here — that would cause a double-init.
import tracer from 'dd-trace';
export default tracer;
