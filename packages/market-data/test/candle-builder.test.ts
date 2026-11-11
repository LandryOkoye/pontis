import { candles, pricePoints } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rebuildCandles } from "../src/index.ts";
import { seedRegistry } from "./fixtures.ts";

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const MIN = 60_000;

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db, { aaa: 6, bbb: 8 });
});
afterAll(async () => {
  await t.drop();
});

const point = (rep: string, offset: number, price: string, simulated: boolean) => ({
  representationId: rep,
  ts: new Date(T0 + offset),
  price,
  currency: "USD",
  source: simulated ? ("simulated_feed" as const) : ("pontis_trades" as const),
  simulated,
});

describe("rebuildCandles", () => {
  it("keeps real and simulated data in separate candles and is idempotent", async () => {
    await t.db
      .insert(pricePoints)
      .values([
        point("aaa", 0, "10", true),
        point("aaa", 2 * MIN, "12", true),
        point("aaa", 0, "50", false),
      ]);
    const range = { from: new Date(T0), to: new Date(T0 + 3 * MIN), intervals: ["1m"] as const };
    const first = await rebuildCandles(t.db, range);
    const again = await rebuildCandles(t.db, range);
    expect(again).toEqual(first);

    const rows = await t.db
      .select()
      .from(candles)
      .where(eq(candles.representationId, "aaa"))
      .orderBy(candles.simulated, candles.bucketStart);
    expect(rows.map((r) => [r.simulated, r.filled, Number(r.close)])).toEqual([
      [false, false, 50],
      [false, true, 50],
      [false, true, 50],
      [true, false, 10],
      [true, true, 10],
      [true, false, 12],
    ]);
    // A representation with no prices gets no candles at all.
    expect(await t.db.select().from(candles).where(eq(candles.representationId, "bbb"))).toEqual(
      [],
    );
  });

  it("carries the close from before the range and rewrites a bucket when the data changes", async () => {
    await t.db.insert(pricePoints).values(point("bbb", -5 * MIN, "7", true));
    await rebuildCandles(t.db, {
      from: new Date(T0),
      to: new Date(T0 + MIN),
      representationIds: ["bbb"],
      intervals: ["1m"],
    });
    const [carried] = await t.db.select().from(candles).where(eq(candles.representationId, "bbb"));
    expect([carried?.filled, Number(carried?.close)]).toEqual([true, 7]);

    await t.db.insert(pricePoints).values(point("bbb", 10_000, "9", true));
    await rebuildCandles(t.db, {
      from: new Date(T0),
      to: new Date(T0 + MIN),
      representationIds: ["bbb"],
      intervals: ["1m"],
    });
    const rows = await t.db.select().from(candles).where(eq(candles.representationId, "bbb"));
    expect(rows).toHaveLength(1);
    expect([rows[0]?.filled, Number(rows[0]?.close)]).toEqual([false, 9]);
  });
});
