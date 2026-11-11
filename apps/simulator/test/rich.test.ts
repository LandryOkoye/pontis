import { navPoints, pricePoints, supplySnapshots, trades } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { devKey } from "@pontis/dev-keys";
import { parsePrice } from "@pontis/domain";
import { RICH_CLAIMS, STEP_MS, signPoint } from "@pontis/market-data";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { simulatedTrades, type SimRep } from "../src/flow.ts";
import { backfill } from "../src/simulate.ts";
import { START_SUPPLY_TOKENS, supplyOnDay } from "../src/supply.ts";
import {
  FLOW_MAX_PER_HOUR,
  RICH_DAILY_GROWTH_PPM,
  RICH_START_SUPPLY_TOKENS,
} from "../src/supply-rich.ts";
import { seedRegistry } from "./registry.ts";

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const DAY = 86_400_000;
const richIds = Object.keys(RICH_CLAIMS);
const unique = ["syn-art-canvas", "syn-resi-flat"];

describe("rich supply and flow tables", () => {
  it("cover every rich claim", () => {
    expect(Object.keys(RICH_START_SUPPLY_TOKENS).sort()).toEqual([...richIds].sort());
    expect(Object.keys(FLOW_MAX_PER_HOUR).sort()).toEqual([...richIds].sort());
    // Growth is listed for every claim except the single-unit assets, which never change.
    expect(Object.keys(RICH_DAILY_GROWTH_PPM).sort()).toEqual(
      richIds.filter((id) => !unique.includes(id)).sort(),
    );
    for (const id of unique) expect(RICH_START_SUPPLY_TOKENS[id]).toBe(1n);
    for (const id of richIds)
      expect(START_SUPPLY_TOKENS[id], id).toBe(RICH_START_SUPPLY_TOKENS[id]);
  });

  it("keep the original seven claims on the old defaults", () => {
    expect(START_SUPPLY_TOKENS["syn-gold-oz"]).toBe(12_000n);
    expect(START_SUPPLY_TOKENS["syn-usd"]).toBe(500_000_000n);
    // 2,000 ppm a day over 10 days from the anchor, plus the seeded jitter below 10,000 ppm.
    const day = Math.floor(Date.UTC(2026, 6, 11) / DAY);
    const supply = supplyOnDay("syn-gold-oz", "g", 6, day)!;
    expect(supply).toBeGreaterThanOrEqual((12_000n * 10n ** 6n * 1_020_000n) / 1_000_000n);
    expect(supply).toBeLessThan((12_000n * 10n ** 6n * 1_030_000n) / 1_000_000n);
    expect(supplyOnDay("not-simulated", "x", 6, day)).toBeNull();
  });

  it("let a shrinking claim fall without going negative and a unique asset stay at one", () => {
    const early = Math.floor(Date.UTC(2026, 6, 1) / DAY);
    const later = (days: number) => supplyOnDay("syn-stock-marlowe", "m", 6, early + days)!;
    expect(later(120)).toBeLessThan(later(0));
    expect(later(2_000)).toBe(0n);
    for (const day of [early, early + 200]) {
      expect(supplyOnDay("syn-art-canvas", "a", 0, day)).toBe(1n);
    }
  });
});

describe("rich trade flow", () => {
  const rep = (id: string, claimId: string): SimRep => ({
    id,
    claimId,
    decimals: 6,
    multiplier: { num: 1n, den: 1_000_000n },
    startSupplyTokens: START_SUPPLY_TOKENS[claimId] ?? 1n,
  });
  const perHour = (claimId: string) => {
    const reps = [rep(`${claimId}-a`, claimId), rep(`${claimId}-b`, claimId)];
    const from = Date.UTC(2026, 9, 1);
    const found = simulatedTrades(reps, from, from + 60 * DAY);
    expect(found).toEqual(simulatedTrades(reps, from, from + 60 * DAY));
    const counts = new Map<number, number>();
    for (const t of found) {
      const hour = Math.floor(t.ts.getTime() / 3_600_000);
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    }
    return Math.max(0, ...counts.values());
  };

  it("draws below the claim's own maximum per hour", () => {
    expect(perHour("syn-vc-fund")).toBe(1);
    expect(perHour("syn-note-sme")).toBeLessThanOrEqual(2);
    expect(perHour("syn-mmf-usd")).toBeGreaterThan(3);
    expect(perHour("syn-mmf-usd")).toBeLessThanOrEqual(6);
    expect(perHour("syn-gold-oz")).toBeLessThanOrEqual(3);
  });

  it("makes no trade for a claim with one wrapper", () => {
    const from = Date.UTC(2026, 9, 1);
    expect(simulatedTrades([rep("art-a", "syn-art-canvas")], from, from + 30 * DAY)).toEqual([]);
  });
});

describe("backfill over rich claims", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await seedRegistry(t.db, [
      ["eur-a", "syn-eur", 6, "1000000"],
      ["eur-b", "syn-eur", 8, "100000000"],
      ["bill-a", "syn-tbill-3m", 6, "1000000"],
      ["art-a", "syn-art-canvas", 0, "1"],
      ["jpy-a", "syn-jpy", 0, "1"],
    ]);
  });
  afterAll(async () => {
    await t.drop();
  });

  it("writes every representation, trades only between the two euro wrappers, and is idempotent", async () => {
    const result = await backfill(t.db, NOW, 2, "core.testnet");
    expect(result.skipped).toEqual([]);
    expect(result.prices).toBe(5 * ((2 * DAY) / STEP_MS));
    expect(result.navs).toBe((2 * DAY) / STEP_MS);
    const navs = await t.db.select().from(navPoints);
    expect(new Set(navs.map((n) => n.representationId))).toEqual(new Set(["bill-a"]));
    expect(await t.db.select().from(supplySnapshots)).toHaveLength(5 * 2);

    const rows = await t.db.select().from(trades);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.fromId.startsWith("eur-") && r.toId.startsWith("eur-"))).toBe(true);

    const again = await backfill(t.db, NOW, 2, "core.testnet");
    expect([again.prices, again.navs, again.supply, again.trades]).toEqual([0, 0, 0, 0]);
  });

  it("stores the signature signPoint would produce and a yen price that is not zero", async () => {
    const [row] = await t.db.select().from(pricePoints).limit(1);
    const point = {
      representationId: row!.representationId,
      price: parsePrice(row!.price),
      currency: row!.currency,
      asOfMs: row!.ts.getTime(),
      source: row!.source,
      simulated: row!.simulated,
    };
    expect(row!.attestation).toEqual(signPoint(devKey("price-publisher"), point, "core.testnet"));
    const yen = (await t.db.select().from(pricePoints)).filter(
      (p) => p.representationId === "jpy-a",
    );
    expect(yen.every((p) => parsePrice(p.price) > 600_000n)).toBe(true);
  });
});
