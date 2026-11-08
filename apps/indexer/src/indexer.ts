// The indexing loop. Each block is applied and the cursor advanced in one transaction, so a crash
// or a failed RPC call leaves the cursor at the last block whose events are all stored.

import type { Db } from "@pontis/db";
import { applyExecutions } from "./apply.ts";
import type { ChainSource } from "./chain-source.ts";
import { readCursor, rewindCursor, writeCursor } from "./cursor.ts";
import { backoffMs, sleep as realSleep } from "./retry.ts";

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface IndexerOptions {
  db: Db;
  source: ChainSource;
  log: Logger;
  /** First block to read when there is no cursor; default is the newest block that is safe to read. */
  startHeight?: number | undefined;
  /**
   * Blocks held back from the final head. A receipt shows up in the block that delivers it and runs
   * in a later block; its outcome can only be proven once that block is final too.
   */
  confirmations?: number;
}

export interface Pass {
  /** Blocks read, as an inclusive range; `from > to` when there was nothing new. */
  from: number;
  to: number;
  stored: number;
  duplicates: number;
}

export const DEFAULT_CONFIRMATIONS = 3;

/** Reads every block between the cursor and the safe head, then returns. Throws on the first failure. */
export async function indexOnce(options: IndexerOptions): Promise<Pass> {
  const { db, source } = options;
  const target = (await source.finalHeight()) - (options.confirmations ?? DEFAULT_CONFIRMATIONS);
  const cursor = await readCursor(db);
  const from = (cursor ?? (options.startHeight ?? target + 1) - 1) + 1;
  const pass: Pass = { from, to: target, stored: 0, duplicates: 0 };
  if (cursor === undefined) await writeCursor(db, from - 1);
  for (let height = from; height <= target; height++) {
    const executions = await source.executionsAt(height);
    await db.transaction(async (tx) => {
      const applied = await applyExecutions(tx, executions);
      pass.stored += applied.stored;
      pass.duplicates += applied.duplicates;
      await writeCursor(tx, height);
    });
  }
  return pass;
}

export interface RunOptions extends IndexerOptions {
  pollMs: number;
  /** Blocks read again behind the cursor when the loop starts. */
  rescanBlocks: number;
  signal: AbortSignal;
  maxBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Polls until `signal` aborts; failures are logged and retried with growing pauses. */
export async function runIndexer(options: RunOptions): Promise<void> {
  const { log, signal, pollMs } = options;
  const wait = options.sleep ?? ((ms: number) => realSleep(ms, signal));
  await rewindCursor(options.db, options.rescanBlocks);
  let failures = 0;
  while (!signal.aborted) {
    try {
      const pass = await indexOnce(options);
      failures = 0;
      if (pass.stored > 0 || pass.duplicates > 0) log.info("indexed", { ...pass });
      await wait(pollMs);
    } catch (error) {
      const pause = backoffMs(failures++, pollMs, options.maxBackoffMs ?? 60_000);
      log.error("indexing failed; will retry", { error: String(error), retryInMs: pause });
      await wait(pause);
    }
  }
}
