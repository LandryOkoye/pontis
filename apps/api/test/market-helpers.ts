// A registry from the near-client fixtures (tgold-a, tgold-b) with hand-placed market rows, so the
// market reads are tested without running the simulator.

import { pricePoints, supplySnapshots, trades, assetProfiles, type Db } from "@pontis/db";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { rebuildCandles, refreshMarketStats, refreshSearchIndex } from "@pontis/market-data";
import { syncRegistry } from "../src/sync/registry-sync.ts";

export const NOW = new Date("2026-11-11T12:00:00Z");
const HOUR = 3_600_000;

const point = (rep: string, hoursAgo: number, price: string, simulated: boolean) => ({
  representationId: rep,
  ts: new Date(NOW.getTime() - hoursAgo * HOUR),
  price,
  currency: "USD",
  source: simulated ? ("simulated_feed" as const) : ("pontis_trades" as const),
  simulated,
});

/**
 * tgold-a: simulated prices 30 h ago (100) and now (110), plus one real price now (99), a trade and
 * supply. tgold-b: simulated 2 now and a bigger supply. Candles, stats and search are built.
 */
export async function seedMarket(db: Db): Promise<void> {
  await syncRegistry(db, fixtureSource());
  await db
    .insert(pricePoints)
    .values([
      point("tgold-a", 30, "100", true),
      point("tgold-a", 0, "110", true),
      point("tgold-a", 0, "99", false),
      point("tgold-b", 30, "2", true),
      point("tgold-b", 0, "2", true),
    ]);
  const supply = (rep: string, hoursAgo: number, chain: string, value: string) => ({
    representationId: rep,
    chain,
    ts: new Date(NOW.getTime() - hoursAgo * HOUR),
    supply: value,
    source: "simulated_feed" as const,
    simulated: true,
  });
  await db
    .insert(supplySnapshots)
    .values([
      supply("tgold-a", 5, "near-testnet", "1000000000"),
      supply("tgold-a", 5, "base-sepolia", "500000000"),
      supply("tgold-b", 5, "near-testnet", "900000000000"),
    ]);
  await db.insert(trades).values({
    ref: "sim:test:1",
    kind: "conversion",
    ts: new Date(NOW.getTime() - 2 * HOUR),
    accountId: "alice.test",
    fromId: "tgold-a",
    toId: "tgold-b",
    amountIn: "5000000",
    amountOut: "49950000000",
    fee: "50000000",
    source: "simulated_feed",
    simulated: true,
  });
  await db.insert(assetProfiles).values({
    representationId: "tgold-a",
    description: "Test profile",
    tags: ["gold", "synthetic"],
    chains: [
      { chain: "near-testnet", contract: "tgold-a.pontis.testnet", role: "native" },
      { chain: "base-sepolia", contract: null, role: "wrapped" },
    ],
    bridgeable: true,
    source: "simulated_feed",
    simulated: true,
  });
  await rebuildCandles(db, {
    from: new Date(NOW.getTime() - 48 * HOUR),
    to: new Date(NOW.getTime() + HOUR),
  });
  await refreshMarketStats(db, NOW);
  await refreshSearchIndex(db, NOW);
}
