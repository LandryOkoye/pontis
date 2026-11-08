// Retry with exponential backoff for RPC calls and for the indexer loop itself.

import { RpcError } from "@pontis/near-client";

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `baseMs`, `2 * baseMs`, `4 * baseMs` ... capped at `maxMs`; `attempt` starts at 0. */
export function backoffMs(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** attempt);
}

// Structured node answers that mean "try again"; any other structured answer is definitive.
const TRANSIENT_CAUSES = new Set(["TIMEOUT_ERROR", "INTERNAL_ERROR", "NOT_SYNCED_YET"]);

/** Transport failures, timeouts, HTTP errors without a body and busy nodes are worth retrying. */
export function isTransient(error: unknown): boolean {
  if (error instanceof RpcError && error.causeName !== undefined) {
    return TRANSIENT_CAUSES.has(error.causeName);
  }
  return true;
}

export interface RetryOptions {
  /** Total tries, including the first. */
  attempts: number;
  baseMs: number;
  maxMs: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const wait = options.sleep ?? sleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt + 1 >= options.attempts || !isTransient(error)) throw error;
      await wait(backoffMs(attempt, options.baseMs, options.maxMs));
    }
  }
}
