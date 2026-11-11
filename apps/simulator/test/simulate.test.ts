import {
  assetMarketStats,
  candles,
  navPoints,
  pricePoints,
  supplySnapshots,
  trades,
} from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { parsePrice } from "@pontis/domain";
import { STEP_MS, verifyPoint } from "@pontis/market-data";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfill, tick } from "../src/simulate.ts";
import { seedRegistry } from "./registry.ts";

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const DAY = 86_400_000;

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db, [
    ["gold-a", "syn-gold-oz", 6, "1000000"],
    ["gold-b", "syn-gold-oz", 8, "1000000000"],
    ["ustb-a", "syn-ustb", 6, "1000000"],
    ["mystery", "not-simulated", 6, "1000000"],
  ]);
});
afterAll(async () => {
  await t.drop();
});

describe("backfill", () => {
  it("writes only simulated, signed rows for represented claims and leaves the rest alone", async () => {
    const result = await backfill(t.db, NOW, 2);
    expect(result.skipped).toEqual(["mystery"]);
    expect(result.prices).toBe(3 * ((2 * DAY) / STEP_MS));

    const prices = await t.db.select().from(pricePoints);
    expect(prices.every((p) => p.simulated && p.source === "simulated_feed")).toBe(true);
    expect(prices.some((p) => p.representationId === "mystery")).toBe(false);
    // Each stored attestation verifies against the stored point and not against a changed one.
    const row = prices[0]!;
    const point = {
      representationId: row.representationId,
      price: parsePrice(row.price),
      currency: row.currency,
      asOfMs: row.ts.getTime(),
      source: row.source,
      simulated: row.simulated,
    };
    expect(verifyPoint(row.attestation!, point)).toBe(true);
    expect(verifyPoint(row.attestation!, { ...point, price: point.price + 1n })).toBe(false);

    // NAV only for the fund, daily supply for everything, flagged the same way.
    const navs = await t.db.select().from(navPoints);
    expect([...new Set(navs.map((n) => n.representationId))]).toEqual(["ustb-a"]);
    const supply = await t.db.select().from(supplySnapshots);
    expect(supply.every((s) => s.simulated)).toBe(true);
    expect(supply).toHaveLength(3 * 2);
  });

  it("makes parity trades between the two gold wrappers only, with the contract's rounding", async () => {
    const rows = await t.db.select().from(trades);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.simulated && r.source === "simulated_feed")).toBe(true);
    expect(rows.every((r) => r.fromId.startsWith("gold") && r.toId.startsWith("gold"))).toBe(true);
    const toB = rows.find((r) => r.fromId === "gold-a")!;
    // 1 gold-a smallest unit is 1e-6 ounce, 1 gold-b smallest unit is 1e-9, so 1000 B per A, less 10 bps.
    const gross = BigInt(toB.amountIn) * 1000n;
    expect(BigInt(toB.amountOut) + BigInt(toB.fee)).toBe(gross);
    expect(BigInt(toB.fee)).toBe((gross * 10n + 9_999n) / 10_000n);
  });

  it("feeds the market tables, simulated class only, and is idempotent", async () => {
    const stats = await t.db.select().from(assetMarketStats);
    expect(stats.length).toBe(3);
    expect(stats.every((s) => s.simulated)).toBe(true);
    expect((await t.db.select().from(candles)).every((c) => c.simulated)).toBe(true);

    const again = await backfill(t.db, NOW, 2);
    expect([again.prices, again.navs, again.supply, again.trades]).toEqual([0, 0, 0, 0]);
  });
});

describe("tick", () => {
  it("continues from the newest price without a gap or a duplicate", async () => {
    const later = NOW + 30 * 60_000;
    const result = await tick(t.db, later);
    // Six new five-minute points per represented representation.
    expect(result.prices).toBe(3 * 6);
    expect((await tick(t.db, later)).prices).toBe(0);
  });
});
