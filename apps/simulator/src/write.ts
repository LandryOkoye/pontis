// Writes simulated rows. Everything is `simulated: true` and `source: "simulated_feed"`, and every
// insert is idempotent, so a backfill can be repeated and `run` can overlap it.

import { supplySnapshots, trades, type Db } from "@pontis/db";
import { formatPrice } from "@pontis/domain";
import { devKey } from "@pontis/dev-keys";
import {
  bulkInsert,
  mapLimit,
  signPointAsync,
  type BulkColumn,
  type PriceAttestation,
  type SimulatedPriceFeed,
} from "@pontis/market-data";
import { sql } from "drizzle-orm";
import { simulatedTrades, type SimRep } from "./flow.ts";
import { supplyOnDay } from "./supply.ts";

// Postgres allows 65,535 bind parameters per statement and the widest table here (trades) has 11
// columns, so 5,000 rows a statement always fits.
const BATCH = 5_000;
/** Representations written at once; the pool holds ten connections and each uses one at a time. */
const CONCURRENCY = 6;
const DAY_MS = 86_400_000;
const CHAIN = "near-testnet";

const PRICE_COLUMNS: readonly BulkColumn[] = [
  { name: "representation_id", type: "text" },
  { name: "ts", type: "timestamptz" },
  { name: "price", type: "numeric" },
  { name: "currency", type: "text" },
  { name: "source", type: "text" },
  { name: "simulated", type: "boolean" },
  { name: "attestation", type: "jsonb" },
];
const NAV_COLUMNS: readonly BulkColumn[] = [
  { name: "representation_id", type: "text" },
  { name: "ts", type: "timestamptz" },
  { name: "nav", type: "numeric" },
  { name: "currency", type: "text" },
  { name: "source", type: "text" },
  { name: "simulated", type: "boolean" },
];
const SKIP_DUPLICATES = sql`ON CONFLICT DO NOTHING`;

async function insertBatches<T>(rows: readonly T[], insert: (batch: T[]) => Promise<number>) {
  let stored = 0;
  for (let i = 0; i < rows.length; i += BATCH) stored += await insert(rows.slice(i, i + BATCH));
  return stored;
}

/** Signed price points and NAV points in `[fromMs, toMs)` for each representation. Returns new rows. */
export async function writePrices(
  db: Db,
  feed: SimulatedPriceFeed,
  reps: readonly SimRep[],
  fromMs: number,
  toMs: number,
  contract: string,
): Promise<{ prices: number; navs: number }> {
  const key = devKey("price-publisher");
  const counts = await mapLimit(reps, CONCURRENCY, async (rep) => {
    // Signing runs on the libuv threadpool (see main.ts), so the points of one representation sign in parallel.
    const history = feed.history(rep.id, fromMs, toMs);
    const attestations = await Promise.all(history.map((p) => signPointAsync(key, p, contract)));
    const points = history.map((p, i) => ({
      representation_id: p.representationId,
      ts: new Date(p.asOfMs),
      price: formatPrice(p.price),
      currency: p.currency,
      source: p.source,
      simulated: p.simulated,
      attestation: attestations[i] as PriceAttestation,
    }));
    const stored = await insertBatches(points, (batch) =>
      bulkInsert(db, "price_points", PRICE_COLUMNS, batch, SKIP_DUPLICATES),
    );
    const nav = feed.navHistory(rep.id, fromMs, toMs).map((p) => ({
      representation_id: p.representationId,
      ts: new Date(p.asOfMs),
      nav: formatPrice(p.nav),
      currency: p.currency,
      source: p.source,
      simulated: p.simulated,
    }));
    const storedNav = await insertBatches(nav, (batch) =>
      bulkInsert(db, "nav_points", NAV_COLUMNS, batch, SKIP_DUPLICATES),
    );
    return { prices: stored, navs: storedNav };
  });
  return {
    prices: counts.reduce((sum, c) => sum + c.prices, 0),
    navs: counts.reduce((sum, c) => sum + c.navs, 0),
  };
}

/** One supply snapshot per representation per UTC day that starts in `[fromMs, toMs)`. */
export async function writeSupply(
  db: Db,
  reps: readonly SimRep[],
  fromMs: number,
  toMs: number,
): Promise<number> {
  const rows = [];
  for (let day = Math.ceil(fromMs / DAY_MS); day * DAY_MS < toMs; day++) {
    for (const rep of reps) {
      const supply = supplyOnDay(rep.claimId, rep.id, rep.decimals, day);
      if (supply === null) continue;
      rows.push({
        representationId: rep.id,
        chain: CHAIN,
        ts: new Date(day * DAY_MS),
        supply: supply.toString(),
        source: "simulated_feed" as const,
        simulated: true,
      });
    }
  }
  return insertBatches(
    rows,
    async (batch) =>
      (
        await db
          .insert(supplySnapshots)
          .values(batch)
          .onConflictDoNothing()
          .returning({ id: supplySnapshots.id })
      ).length,
  );
}

export async function writeTrades(
  db: Db,
  reps: readonly SimRep[],
  fromMs: number,
  toMs: number,
): Promise<number> {
  const rows = simulatedTrades(reps, fromMs, toMs).map((t) => ({
    ref: t.ref,
    kind: "conversion",
    ts: t.ts,
    accountId: t.accountId,
    fromId: t.fromId,
    toId: t.toId,
    amountIn: t.amountIn.toString(),
    amountOut: t.amountOut.toString(),
    fee: t.fee.toString(),
    source: "simulated_feed" as const,
    simulated: true,
  }));
  return insertBatches(
    rows,
    async (batch) =>
      (await db.insert(trades).values(batch).onConflictDoNothing().returning({ id: trades.id }))
        .length,
  );
}
