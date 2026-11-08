// GET /v1/health: database reachable, chain height, and how far the indexer is behind (B12 writes
// the cursor; until then lag is null). Never throws: a failed probe reports `degraded`.

import { ENDPOINTS } from "@pontis/api-types";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "@pontis/db";
import { indexerCursor } from "@pontis/db";

export const INDEXER_CURSOR_NAME = "indexer";

async function attempt<T>(probe: () => Promise<T>): Promise<T | null> {
  try {
    return await probe();
  } catch {
    return null;
  }
}

export function registerHealthRoute(
  app: FastifyInstance,
  db: Db,
  chainHeight: () => Promise<number>,
): void {
  app.get(ENDPOINTS.getHealth.path, async () => {
    const [dbOk, height] = await Promise.all([
      attempt(() => db.execute(sql`select 1`)),
      attempt(chainHeight),
    ]);
    const cursor = dbOk
      ? ((
          await attempt(() =>
            db.select().from(indexerCursor).where(eq(indexerCursor.name, INDEXER_CURSOR_NAME)),
          )
        )?.[0] ?? null)
      : null;
    return ENDPOINTS.getHealth.response.parse({
      status: dbOk && height !== null ? "ok" : "degraded",
      chainHeight: height,
      indexerLagBlocks: height !== null && cursor ? Math.max(0, height - cursor.blockHeight) : null,
    });
  });
}
