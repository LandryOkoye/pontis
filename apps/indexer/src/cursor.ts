// The indexer's resume point: the last block whose events are fully applied. Read by the API's
// health route to report lag, so the name must match `INDEXER_CURSOR_NAME`.

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

/** Moves an existing cursor back by `blocks` so the most recent blocks are read again. */
export async function rewindCursor(db: Db, blocks: number): Promise<void> {
  await db
    .update(indexerCursor)
    .set({ blockHeight: sql`greatest(${indexerCursor.blockHeight} - ${blocks}, 0)` })
    .where(eq(indexerCursor.name, CURSOR_NAME));
}
