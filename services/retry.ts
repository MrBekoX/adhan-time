import { ApiRateLimitError, ApiServerError, NetworkError } from './errors';

type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  retryOn?: (e: unknown) => boolean;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 1000, retryOn = isRetryable } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === retries || !retryOn(e)) throw e;
      const delay =
        e instanceof ApiRateLimitError
          ? Math.min(e.retryAfterSec * 1000, 60_000)
          : baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastError;
}

function isRetryable(e: unknown): boolean {
  return e instanceof NetworkError || e instanceof ApiServerError || e instanceof ApiRateLimitError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
