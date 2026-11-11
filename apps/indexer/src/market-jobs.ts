// Runs the market jobs (trade sync, candles, stats, search index) on a timer, next to the
// reconciler. A failed pass is logged and retried at the next interval.

import { runMarketJobsOnce } from "@pontis/market-data";
import type { Db } from "@pontis/db";
import type { Logger } from "./indexer.ts";
import { sleep as realSleep } from "./retry.ts";

export interface RunMarketJobsOptions {
  db: Db;
  intervalMs: number;
  /** How far back candles are rebuilt on each pass. */
  windowMs: number;
  signal: AbortSignal;
  log: Logger;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export async function runMarketJobs(options: RunMarketJobsOptions): Promise<void> {
  const { db, intervalMs, windowMs, signal, log } = options;
  const wait = options.sleep ?? ((ms: number) => realSleep(ms, signal));
  const now = options.now ?? (() => new Date());
  while (!signal.aborted) {
    try {
      const result = await runMarketJobsOnce(db, now(), windowMs);
      log.info("market jobs", { ...result });
    } catch (error) {
      log.error("market jobs failed; will retry", { error: String(error) });
    }
    await wait(intervalMs);
  }
}
