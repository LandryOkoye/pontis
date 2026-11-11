import { assetMarketStats, pricePoints, supplySnapshots, trades } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rebuildCandles, refreshMarketStats } from "../src/index.ts";
import { seedRegistry } from "./fixtures.ts";

const NOW = new Date(Date.UTC(2026, 10, 10, 12, 0, 0));
const HOUR = 3_600_000;

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db, { aaa: 6, bbb: 6, ccc: 6 });
  const p = (rep: string, hoursAgo: number, price: string, simulated: boolean) => ({
    representationId: rep,
    ts: new Date(NOW.getTime() - hoursAgo * HOUR),
    price,
    currency: "USD",
    source: simulated ? ("simulated_feed" as const) : ("pontis_trades" as const),
    simulated,
  });
  await t.db
    .insert(pricePoints)
    .values([
      p("aaa", 30, "100", true),
      p("aaa", 0, "110", true),
      p("bbb", 0, "2", true),
      p("aaa", 0, "99", false),
    ]);
  await t.db.insert(supplySnapshots).values([
    {
      representationId: "aaa",
      chain: "near-testnet",
      ts: new Date(NOW.getTime() - HOUR),
      supply: "1000000000",
      source: "simulated_feed",
      simulated: true,
    },
    {
      representationId: "bbb",
      chain: "near-testnet",
      ts: new Date(NOW.getTime() - HOUR),
      supply: "9000000000",
      source: "simulated_feed",
      simulated: true,
    },
  ]);
  await t.db.insert(trades).values({
    ref: "sim:1",
    kind: "conversion",
    ts: new Date(NOW.getTime() - 2 * HOUR),
    accountId: "alice.test",
    fromId: "aaa",
    toId: "bbb",
    amountIn: "5000000",
    amountOut: "1",
    fee: "0",
    source: "simulated_feed",
    simulated: true,
  });
  await rebuildCandles(t.db, {
    from: new Date(NOW.getTime() - 48 * HOUR),
    to: NOW,
    intervals: ["1h"],
  });
});
afterAll(async () => {
  await t.drop();
});

describe("refreshMarketStats", () => {
  it("computes price, change, market cap, volume and rank per data class", async () => {
    await refreshMarketStats(t.db, NOW);
    const rows = await t.db
      .select()
      .from(assetMarketStats)
      .orderBy(assetMarketStats.representationId);
    const by = (id: string, simulated: boolean) =>
      rows.find((r) => r.representationId === id && r.simulated === simulated);

    const sim = by("aaa", true);
    // 24h ago the 1h candle closed at 100; now 110.
    expect([Number(sim?.price), sim?.change24hBps, sim?.change7dBps]).toEqual([110, 1000, null]);
    expect([Number(sim?.marketCap), Number(sim?.volume24h)]).toEqual([110_000, 550]);
    // bbb is 9000 tokens at 2, 18000 in all, so it ranks below aaa.
    expect([sim?.rank, by("bbb", true)?.rank]).toEqual([1, 2]);

    const real = by("aaa", false);
    expect([Number(real?.price), real?.supply, real?.marketCap, Number(real?.volume24h)]).toEqual([
      99,
      null,
      null,
      0,
    ]);
  });

  it("is idempotent and drops stats of representations that lost their prices", async () => {
    await refreshMarketStats(t.db, NOW);
    await t.db.delete(pricePoints).where(eq(pricePoints.representationId, "bbb"));
    await refreshMarketStats(t.db, NOW);
    const rows = await t.db.select().from(assetMarketStats);
    expect(rows.map((r) => `${r.representationId}:${r.simulated}`).sort()).toEqual([
      "aaa:false",
      "aaa:true",
    ]);
  });
});
