// Writes simulated rows. Everything is `simulated: true` and `source: "simulated_feed"`, and every
// insert is idempotent, so a backfill can be repeated and `run` can overlap it.

import { navPoints, pricePoints, supplySnapshots, trades, type Db } from "@pontis/db";
import { formatPrice } from "@pontis/domain";
import { devKey } from "@pontis/dev-keys";
import { signPoint, type SimulatedPriceFeed } from "@pontis/market-data";
import { simulatedTrades, type SimRep } from "./flow.ts";
import { supplyOnDay } from "./supply.ts";

const BATCH = 1_000;
const DAY_MS = 86_400_000;
const CHAIN = "near-testnet";

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
  let prices = 0;
  let navs = 0;
  for (const rep of reps) {
    const points = feed.history(rep.id, fromMs, toMs).map((p) => ({
      representationId: p.representationId,
      ts: new Date(p.asOfMs),
      price: formatPrice(p.price),
      currency: p.currency,
      source: p.source,
      simulated: p.simulated,
      attestation: signPoint(key, p, contract),
    }));
    prices += await insertBatches(
      points,
      async (batch) =>
        (
          await db
            .insert(pricePoints)
            .values(batch)
            .onConflictDoNothing()
            .returning({ id: pricePoints.id })
        ).length,
    );
    const nav = feed.navHistory(rep.id, fromMs, toMs).map((p) => ({
      representationId: p.representationId,
      ts: new Date(p.asOfMs),
      nav: formatPrice(p.nav),
      currency: p.currency,
      source: p.source,
      simulated: p.simulated,
    }));
    navs += await insertBatches(
      nav,
      async (batch) =>
        (
          await db
            .insert(navPoints)
            .values(batch)
            .onConflictDoNothing()
            .returning({ id: navPoints.id })
        ).length,
    );
  }
  return { prices, navs };
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
