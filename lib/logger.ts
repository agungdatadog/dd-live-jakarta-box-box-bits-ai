import winston, { createLogger, format, transports } from 'winston';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

// The sidecar Datadog Agent tails this file via DD_SERVERLESS_LOG_PATH.
// The path must be on the shared in-memory volume mounted at /shared-volume.
const LOG_FILE = process.env.DD_LOG_FILE || '/shared-volume/logs/app.log';

const logTransports: winston.transport[] = [new transports.Console()];

// Only add the file transport when running inside the container.
// The emptyDir volume mount creates /shared-volume empty at startup,
// so we create /shared-volume/logs synchronously before opening the file.
if (process.env.NODE_ENV === 'production') {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    logTransports.push(
      new transports.File({
        filename: LOG_FILE,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
        tailable: true,
      })
    );
  } catch {
    // Silently skip file transport if the path is not writable.
  }
}

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
  transports: logTransports,
});

export { logger };
