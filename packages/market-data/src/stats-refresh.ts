// Refreshes `asset_market_stats` (ADR 0015 section 4): real and simulated are never blended.

import {
  assetMarketStats,
  assetRepresentations,
  candles,
  pricePoints,
  supplySnapshots,
  trades,
  type Db,
} from "@pontis/db";
import { changeBps, formatPrice, parsePrice } from "@pontis/domain";
import { and, desc, eq, gt, lte, notInArray } from "drizzle-orm";
import { valueAt } from "./candles.ts";
import { rankByMarketCap } from "./stats.ts";

const HOUR = 3_600_000;
const WINDOWS = {
  change24hBps: 24 * HOUR,
  change7dBps: 7 * 24 * HOUR,
  change30dBps: 30 * 24 * HOUR,
};

export async function refreshMarketStats(db: Db, now: Date): Promise<{ rows: number }> {
  const reps = await db
    .select({
      id: assetRepresentations.id,
      decimals: assetRepresentations.decimals,
      vaultInventory: assetRepresentations.vaultInventory,
    })
    .from(assetRepresentations);
  let written = 0;
  for (const simulated of [false, true]) {
    const computed: (typeof assetMarketStats.$inferInsert)[] = [];
    for (const rep of reps) {
      const [latest] = await db
        .select()
        .from(pricePoints)
        .where(
          and(
            eq(pricePoints.representationId, rep.id),
            eq(pricePoints.simulated, simulated),
            lte(pricePoints.ts, now),
          ),
        )
        .orderBy(desc(pricePoints.ts))
        .limit(1);
      if (!latest) continue;
      const price = parsePrice(latest.price);
      const change = {} as Record<keyof typeof WINDOWS, number | null>;
      for (const key of Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]) {
        const [ref] = await db
          .select({ close: candles.close })
          .from(candles)
          .where(
            and(
              eq(candles.representationId, rep.id),
              eq(candles.interval, "1h"),
              eq(candles.simulated, simulated),
              lte(candles.bucketStart, new Date(now.getTime() - WINDOWS[key])),
            ),
          )
          .orderBy(desc(candles.bucketStart))
          .limit(1);
        change[key] = ref ? changeBps(parsePrice(ref.close), price) : null;
      }

      const snapshots = await db
        .select()
        .from(supplySnapshots)
        .where(
          and(
            eq(supplySnapshots.representationId, rep.id),
            eq(supplySnapshots.simulated, simulated),
            lte(supplySnapshots.ts, now),
          ),
        )
        .orderBy(desc(supplySnapshots.ts));
      const perChain = new Map<string, bigint>();
      for (const s of snapshots)
        if (!perChain.has(s.chain)) perChain.set(s.chain, BigInt(s.supply));
      const supply = perChain.size > 0 ? [...perChain.values()].reduce((a, b) => a + b, 0n) : null;
      const recent = await db
        .select({ amountIn: trades.amountIn })
        .from(trades)
        .where(
          and(
            eq(trades.fromId, rep.id),
            eq(trades.simulated, simulated),
            gt(trades.ts, new Date(now.getTime() - 24 * HOUR)),
          ),
        );
      const volume = recent.reduce((sum, r) => sum + BigInt(r.amountIn), 0n);
      computed.push({
        representationId: rep.id,
        simulated,
        currency: latest.currency,
        price: latest.price,
        priceAsOf: latest.ts,
        ...change,
        supply: supply === null ? null : supply.toString(),
        marketCap: supply === null ? null : formatPrice(valueAt(supply, rep.decimals, price)),
        volume24h: formatPrice(valueAt(volume, rep.decimals, price)),
        tvl: formatPrice(valueAt(BigInt(rep.vaultInventory), rep.decimals, price)),
        sources: [latest.source],
        refreshedAt: now,
      });
    }

    const ranks = rankByMarketCap(
      computed.map((c) => ({
        id: c.representationId,
        marketCap: c.marketCap ? parsePrice(c.marketCap) : null,
      })),
    );
    for (const row of computed) row.rank = ranks.get(row.representationId) ?? null;

    await db.transaction(async (tx) => {
      const ids = computed.map((c) => c.representationId);
      await tx
        .delete(assetMarketStats)
        .where(
          and(
            eq(assetMarketStats.simulated, simulated),
            ids.length > 0 ? notInArray(assetMarketStats.representationId, ids) : undefined,
          ),
        );
      for (const row of computed) {
        await tx
          .insert(assetMarketStats)
          .values(row)
          .onConflictDoUpdate({
            target: [assetMarketStats.representationId, assetMarketStats.simulated],
            set: row,
          });
      }
    });
    written += computed.length;
  }
  return { rows: written };
}
