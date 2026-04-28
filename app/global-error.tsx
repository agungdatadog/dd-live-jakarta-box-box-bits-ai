'use client';

import { useEffect } from 'react';
import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Forward to RUM (creates a RUM error event linked to the active session)
    // and to Logs Management (correlated with the RUM session and any
    // in-flight backend APM trace via the browser-logs SDK).
    try {
      datadogRum.addError(error, { digest: error.digest });
    } catch {}
    try {
      datadogLogs.logger.error(
        error.message || 'Unhandled client error',
        { digest: error.digest, source: 'global-error' },
        error,
      );
    } catch {}
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-50 font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-zinc-400">
            An unexpected error occurred. The issue has been reported.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-zinc-500">ref: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
