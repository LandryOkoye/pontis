// The status page feed (brief section 12.1, screen 9): indexer health, how fresh prices and the
// market jobs are, and route health. Reserves and bridge invariants are null until they exist.

import type { Status } from "@pontis/api-types";
import { assetMarketStats, compatibilityRelationships, pricePoints, type Db } from "@pontis/db";
import { count, eq, max } from "drizzle-orm";

const PRICE_STALE_MS = 15 * 60_000;
const JOBS_STALE_MS = 5 * 60_000;

const freshness = (latest: Date | null, now: Date, staleMs: number) => {
  const age = latest ? Math.max(0, now.getTime() - latest.getTime()) : null;
  return {
    latestAt: latest ? latest.toISOString() : null,
    ageSeconds: age === null ? null : Math.floor(age / 1000),
    stale: age === null || age > staleMs,
  };
};

export async function status(db: Db, health: Status["health"], now: Date): Promise<Status> {
  const newest = async (simulated: boolean) =>
    (
      await db
        .select({ at: max(pricePoints.ts) })
        .from(pricePoints)
        .where(eq(pricePoints.simulated, simulated))
    )[0]?.at ?? null;
  const [jobs] = await db.select({ at: max(assetMarketStats.refreshedAt) }).from(assetMarketStats);
  const byStatus = await db
    .select({ status: compatibilityRelationships.status, n: count() })
    .from(compatibilityRelationships)
    .groupBy(compatibilityRelationships.status);
  const routes = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;
  return {
    asOf: now.toISOString(),
    health,
    prices: {
      real: freshness(await newest(false), now, PRICE_STALE_MS),
      simulated: freshness(await newest(true), now, PRICE_STALE_MS),
    },
    marketJobs: freshness(jobs?.at ?? null, now, JOBS_STALE_MS),
    routes: {
      approved: routes("approved"),
      suspended: routes("suspended"),
      proposed: routes("proposed"),
    },
    reserves: null,
    bridge: null,
    incidents: [],
  };
}
