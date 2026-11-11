import { pricePoints, settlementEvents } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMarketJobsOnce } from "../src/index.ts";
import { seedRegistry } from "./fixtures.ts";

const NOW = new Date(Date.UTC(2026, 10, 10, 12, 0, 0));

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db, { aaa: 6 });
});
afterAll(async () => {
  await t.drop();
});

describe("runMarketJobsOnce", () => {
  it("runs every job in order: a trade and a price become a candle, a stat row and a search document", async () => {
    await t.db.insert(settlementEvents).values({
      receiptId: "r1",
      logIndex: 0,
      blockHeight: 1,
      blockTimestamp: new Date(NOW.getTime() - 30 * 60_000),
      eventName: "conversion_completed",
      data: {
        user: "alice.test",
        from_representation_id: "aaa",
        to_representation_id: "aaa",
        amount_in: "1000000",
        amount_out: "1",
        fee: "0",
      },
    });
    await t.db.insert(pricePoints).values({
      representationId: "aaa",
      ts: new Date(NOW.getTime() - 40 * 60_000),
      price: "3",
      currency: "USD",
      source: "simulated_feed",
      simulated: true,
    });
    const first = await runMarketJobsOnce(t.db, NOW, 2 * 3_600_000);
    expect(first).toMatchObject({ trades: 1, stats: 1, searchDocuments: 1 });
    expect(first.candles).toBeGreaterThan(0);
    // A second pass finds nothing new to fold and rewrites the same candles.
    expect(await runMarketJobsOnce(t.db, NOW, 2 * 3_600_000)).toEqual({ ...first, trades: 0 });
  });
});
