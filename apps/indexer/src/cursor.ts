// The indexer's resume point: the last block whose events are fully applied. Read by the API's
// health route, so the name must match `INDEXER_CURSOR_NAME`. `updated_at` doubles as the
// heartbeat: it moves whenever a block is applied and whenever a pass succeeds with nothing new.

import { indexerCursor, type Db, type DbTx } from "@pontis/db";
import { eq, sql } from "drizzle-orm";

export const CURSOR_NAME = "indexer";

export async function readCursor(db: Db | DbTx): Promise<number | undefined> {
  const [row] = await db.select().from(indexerCursor).where(eq(indexerCursor.name, CURSOR_NAME));
  return row?.blockHeight;
}

export async function writeCursor(db: Db | DbTx, blockHeight: number): Promise<void> {
  await db
    .insert(indexerCursor)
    .values({ name: CURSOR_NAME, blockHeight })
    .onConflictDoUpdate({
      target: indexerCursor.name,
      set: { blockHeight, updatedAt: sql`now()` },
    });
}

/**
 * Creates the first cursor row. Its heartbeat starts at the epoch, so a first pass that then fails
 * reads as stale rather than alive; the first applied block or successful idle pass stamps it.
 */
export async function createCursor(db: Db | DbTx, blockHeight: number): Promise<void> {
  await db
    .insert(indexerCursor)
    .values({ name: CURSOR_NAME, blockHeight, updatedAt: new Date(0) })
    .onConflictDoNothing();
}

/** Heartbeat: stamps `updated_at` on the existing cursor row without moving `block_height`. */
export async function touchCursor(db: Db | DbTx): Promise<void> {
  await db
    .update(indexerCursor)
    .set({ updatedAt: sql`now()` })
    .where(eq(indexerCursor.name, CURSOR_NAME));
}

/** Moves an existing cursor back by `blocks` so the most recent blocks are read again. */
export async function rewindCursor(db: Db, blocks: number): Promise<void> {
  await db
    .update(indexerCursor)
    .set({ blockHeight: sql`greatest(${indexerCursor.blockHeight} - ${blocks}, 0)` })
    .where(eq(indexerCursor.name, CURSOR_NAME));
}
