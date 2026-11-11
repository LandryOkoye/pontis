import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refundRate } from "../src/metrics/conversion-health.ts";
import { DAY, HOUR, ago, context, seedRegistry } from "./metrics-helpers.ts";
import { addConversion, addEvent, addQuote } from "./metrics-seed.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db);
});
afterAll(() => t.drop());

describe("refund_rate", () => {
  it("is null with no outcome events, never 0", async () => {
    expect((await refundRate(context(t.db))).values).toEqual({
      "24h": null,
      "7d": null,
      all: null,
    });
  });

  it("refund_rate counts events by block time, linked or not", async () => {
    const quoteId = await addQuote(t.db, { state: "SETTLED" });
    const conversion = await addConversion(t.db, quoteId, { settledAt: ago(HOUR) });
    await addEvent(t.db, "conversion_completed", ago(HOUR), conversion);
    await addEvent(t.db, "conversion_completed", ago(2 * HOUR), null);
    await addEvent(t.db, "conversion_rejected", ago(3 * HOUR), null);
    await addEvent(t.db, "conversion_failed", ago(2 * DAY), conversion);
    await addEvent(t.db, "conversion_completed", ago(3 * DAY), null);
    await addEvent(t.db, "conversion_completed", ago(20 * DAY), null);
    await addEvent(t.db, "something_else", ago(HOUR), null);
    expect((await refundRate(context(t.db))).values).toEqual({
      "24h": "0.333333",
      "7d": "0.400000",
      all: "0.333333",
    });
  });
});
