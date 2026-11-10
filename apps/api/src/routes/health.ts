// Health endpoints.
//   GET /v1/health/live   process is up; no dependencies; always 200.
//   GET /v1/health/ready  200 when the database and RPC answer and the indexer is running or
//                         lagging; 503 when the database or RPC is down or the indexer never ran
//                         or is stale.
//   GET /v1/health        the combined view; always 200, the body carries the verdict.
// Probes never throw: a failed probe is reported in the body.

import { ENDPOINTS, type Health, type IndexerHealth } from "@pontis/api-types";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "@pontis/db";
import { indexerCursor } from "@pontis/db";

export const INDEXER_CURSOR_NAME = "indexer";
export const DEFAULT_INDEXER_STALE_AFTER_MS = 30_000;
export const DEFAULT_INDEXER_MAX_LAG_BLOCKS = 50;

export interface HealthOptions {
  /** A heartbeat older than this makes the indexer `stale`. */
  staleAfterMs?: number;
  /** A fresh indexer more than this many blocks behind the chain is `lagging`. */
  maxLagBlocks?: number;
  /** Clock used for the heartbeat age; tests inject it. */
  now?: () => Date;
}

async function attempt<T>(probe: () => Promise<T>): Promise<T | null> {
  try {
    return await probe();
  } catch {
    return null;
  }
}

/** The indexer's state from its cursor row (undefined: it never ran) and the chain height. */
export function indexerHealth(
  cursor: { blockHeight: number; updatedAt: Date } | undefined,
  chainHeight: number | null,
  now: Date,
  staleAfterMs: number,
  maxLagBlocks: number,
): IndexerHealth {
  if (!cursor)
    return { state: "never_run", lagBlocks: null, lastHeartbeatAt: null, heartbeatAgeMs: null };
  const lagBlocks = chainHeight === null ? null : Math.max(0, chainHeight - cursor.blockHeight);
  // The heartbeat is stamped by the database clock; a small skew must not give a negative age.
  const heartbeatAgeMs = Math.max(0, now.getTime() - cursor.updatedAt.getTime());
  const state =
    heartbeatAgeMs > staleAfterMs
      ? "stale"
      : lagBlocks !== null && lagBlocks > maxLagBlocks
        ? "lagging"
        : "running";
  return { state, lagBlocks, lastHeartbeatAt: cursor.updatedAt.toISOString(), heartbeatAgeMs };
}

export function registerHealthRoute(
  app: FastifyInstance,
  db: Db,
  chainHeight: () => Promise<number>,
  options: HealthOptions = {},
): void {
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_INDEXER_STALE_AFTER_MS;
  const maxLagBlocks = options.maxLagBlocks ?? DEFAULT_INDEXER_MAX_LAG_BLOCKS;
  const now = options.now ?? (() => new Date());

  async function check(): Promise<Health> {
    const [probe, height] = await Promise.all([
      attempt(() => db.execute(sql`select 1`)),
      attempt(chainHeight),
    ]);
    // Without a database there is no cursor to read: the indexer is unknown, not never_run.
    const read =
      probe === null
        ? null
        : await attempt(() =>
            db.select().from(indexerCursor).where(eq(indexerCursor.name, INDEXER_CURSOR_NAME)),
          );
    const database = read !== null;
    const indexer = read ? indexerHealth(read[0], height, now(), staleAfterMs, maxLagBlocks) : null;
    return ENDPOINTS.getHealth.response.parse({
      status: database && height !== null && indexer?.state === "running" ? "ok" : "degraded",
      chainHeight: height,
      indexerLagBlocks: indexer?.lagBlocks ?? null,
      database,
      rpc: height !== null,
      indexer,
    });
  }

  app.get(ENDPOINTS.getHealthLive.path, async () =>
    ENDPOINTS.getHealthLive.response.parse({ status: "ok" }),
  );

  app.get(ENDPOINTS.getHealth.path, async () => check());

  app.get(ENDPOINTS.getHealthReady.path, async (_req, reply) => {
    const health = await check();
    const state = health.indexer?.state;
    const ready = health.database && health.rpc && (state === "running" || state === "lagging");
    return reply.code(ready ? 200 : 503).send(health);
  });
}
