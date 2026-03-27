/**
 * fetchWithRetry — resilient fetch wrapper with exponential backoff.
 *
 * Handles the three failure modes relevant to LLM API calls:
 *  1. Network/timeout errors  → retry with backoff
 *  2. 429 Rate Limited        → retry after Retry-After header or calculated delay
 *  3. 5xx Server errors       → retry with backoff
 *  4. 4xx (except 429)        → do NOT retry (client error, retrying won't help)
 *
 * Usage:
 *   const res = await fetchWithRetry('/api/pitwall', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ message }),
 *   }, { maxRetries: 5, timeoutMs: 90_000, context: 'pitwall_chat' });
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 5). */
  maxRetries?: number;
  /** Per-attempt timeout in ms — each retry gets a fresh timeout (default: 90 000). */
  timeoutMs?: number;
  /** Base delay for exponential backoff in ms (default: 500). */
  baseDelayMs?: number;
  /** Maximum cap on backoff delay in ms (default: 30 000). */
  maxDelayMs?: number;
  /**
   * Human-readable context label for error messages and RUM actions.
   * e.g. 'pitwall_chat' | 'dream_team_evaluation' | 'driver_name_generation'
   */
  context?: string;
  /**
   * Called each time a retryable failure occurs, before the next attempt.
   * Use to update UI state (e.g. attempt counter, retry message).
   */
  onRetry?: (attempt: number, maxRetries: number, error: string) => void;
}

/** Status codes that should be retried. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Jittered exponential delay: base * 2^attempt ± 15% jitter, capped at maxDelay. */
function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  // ±15% jitter to avoid thundering herd
  const jitter = exp * 0.15 * (Math.random() * 2 - 1);
  return Math.round(exp + jitter);
}

/** Sleep for `ms` milliseconds. */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const {
    maxRetries  = 5,
    timeoutMs   = 90_000,
    baseDelayMs = 500,
    maxDelayMs  = 30_000,
    context     = 'api_call',
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);

      // Success or non-retryable client error → return immediately
      if (!RETRYABLE_STATUSES.has(res.status)) {
        return res;
      }

      // 429 — respect Retry-After if present, otherwise use backoff
      if (res.status === 429 && attempt < maxRetries) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfterMs = retryAfterHeader
          ? parseFloat(retryAfterHeader) * 1000
          : backoffDelay(attempt, baseDelayMs, maxDelayMs);

        lastError = `429 rate limited (context: ${context})`;
        onRetry?.(attempt + 1, maxRetries, `Rate limited. Waiting ${Math.round(retryAfterMs / 1000)}s…`);
        await sleep(retryAfterMs);
        continue;
      }

      // 5xx — retry with backoff
      if (attempt < maxRetries) {
        const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
        lastError = `HTTP ${res.status} (context: ${context})`;
        onRetry?.(attempt + 1, maxRetries, `Server error ${res.status}. Retrying…`);
        await sleep(delay);
        continue;
      }

      // Exhausted retries — return the last response for the caller to handle
      return res;

    } catch (err) {
      clearTimeout(timeoutId);

      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const isNetwork = err instanceof TypeError && err.message.includes('fetch');
      const errorMsg = isAbort
        ? `Timeout after ${timeoutMs}ms (context: ${context})`
        : isNetwork
          ? `Network error (context: ${context})`
          : String(err);

      lastError = err;

      if (attempt < maxRetries) {
        const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
        onRetry?.(
          attempt + 1,
          maxRetries,
          isAbort ? 'Request timed out. Retrying…' : 'Connection lost. Retrying…',
        );
        await sleep(delay);
        continue;
      }

      throw new Error(`[fetchWithRetry] ${errorMsg} — gave up after ${maxRetries + 1} attempts`);
    }
  }

  // Should never reach here, but TypeScript needs the throw
  throw new Error(`[fetchWithRetry] exhausted all retries for ${context}: ${String(lastError)}`);
}

// ── Pre-configured profiles ───────────────────────────────────────────────────

/**
 * For LLM-backed endpoints (pitwall, dream team evaluation).
 * Long timeout because Gemini can take 20–60 s in demo mode.
 * 5 retries, starting at 1 s, capping at 30 s.
 */
export const LLM_FETCH_OPTIONS: RetryOptions = {
  maxRetries:  5,
  timeoutMs:   120_000,   // 2 min — covers demo high-latency mode
  baseDelayMs: 1_000,
  maxDelayMs:  30_000,
};

/**
 * For lightweight generation calls (driver name generator).
 * Shorter timeout and faster retry since this is a UI enhancement, not critical.
 */
export const LIGHT_FETCH_OPTIONS: RetryOptions = {
  maxRetries:  3,
  timeoutMs:   20_000,
  baseDelayMs: 500,
  maxDelayMs:  8_000,
};
