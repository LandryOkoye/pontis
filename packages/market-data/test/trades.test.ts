import { candles, pricePoints, settlementEvents, trades } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rebuildCandles, syncTrades } from "../src/index.ts";
import { seedRegistry } from "./fixtures.ts";

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db, { aaa: 6, bbb: 8 });
});
afterAll(async () => {
  await t.drop();
});

describe("syncTrades", () => {
  const completed = (nonce: string, amountIn: string) => ({
    receiptId: `r-${nonce}`,
    logIndex: 0,
    blockHeight: 1,
    blockTimestamp: new Date(T0),
    eventName: "conversion_completed",
    data: {
      nonce,
      user: "alice.test",
      from_representation_id: "aaa",
      to_representation_id: "bbb",
      amount_in: amountIn,
      amount_out: "10",
      fee: "1",
    },
  });

  it("folds completed conversions into real trades once, and skips malformed events", async () => {
    await t.db
      .insert(settlementEvents)
      .values([
        completed("n1", "1000"),
        completed("n2", "2000"),
        { ...completed("n3", "3000"), data: { nonce: "n3", amount_in: "oops" } },
        { ...completed("n4", "4000"), eventName: "conversion_failed" },
      ]);
    expect(await syncTrades(t.db)).toBe(2);
    expect(await syncTrades(t.db)).toBe(0);
    await t.db.insert(settlementEvents).values(completed("n5", "5000"));
    expect(await syncTrades(t.db)).toBe(1);

    const rows = await t.db
      .select()
      .from(trades)
      .where(eq(trades.source, "pontis_trades"))
      .orderBy(trades.id);
    expect(rows.filter((r) => r.ref.startsWith("event:") && r.eventId !== null)).toHaveLength(3);
    expect(rows.every((r) => !r.simulated)).toBe(true);
  });

  it("feeds real trade volume into the real candle and never the simulated one", async () => {
    const price = (simulated: boolean, p: string) => ({
      representationId: "aaa",
      ts: new Date(T0),
      price: p,
      currency: "USD",
      source: simulated ? ("simulated_feed" as const) : ("pontis_trades" as const),
      simulated,
    });
    await t.db.insert(pricePoints).values([price(false, "50"), price(true, "10")]);
    await rebuildCandles(t.db, {
      from: new Date(T0),
      to: new Date(T0 + 60_000),
      representationIds: ["aaa"],
      intervals: ["1m"],
    });
    const rows = await t.db.select().from(candles).orderBy(candles.simulated);
    // 1000 + 2000 + 5000 units at 6 decimals, valued at the real close of 50.
    expect(rows.map((r) => [r.simulated, r.trades, r.volumeBase, Number(r.volumeQuote)])).toEqual([
      [false, 3, "8000", 0.4],
      [true, 0, "0", 0],
    ]);
  });
});
