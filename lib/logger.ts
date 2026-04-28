import { createLogger, format, transports } from 'winston';

// Logs are written to stdout and collected by Datadog serverless-init,
// which forwards them to Logs Management. dd-trace auto-injects
// dd.trace_id / dd.span_id into each record when DD_LOGS_INJECTION=true,
// correlating logs with APM traces in the Datadog UI.
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: {
    service: process.env.DD_SERVICE || 'box-box-bits-ai',
    env: process.env.DD_ENV || 'production',
    version: process.env.DD_VERSION || process.env.NEXT_PUBLIC_DD_VERSION || 'dev',
  },
  transports: [new transports.Console()],
});

export { logger };
