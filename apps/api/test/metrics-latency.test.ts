import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quoteToSettleLatency, submitToSettleLatencyP95 } from "../src/metrics/latency.ts";
import { DAY, HOUR, ago, context, seedRegistry } from "./metrics-helpers.ts";
import { addConversion, addQuote } from "./metrics-seed.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db);
});
afterAll(() => t.drop());

/** A settled quote that settled `settledAgo` ms ago, `q2s` seconds after its quote (negative: clock skew), `s2s` after submission (null: never reported). */
async function settled(settledAgo: number, q2s: number, s2s: number | null) {
  const settledAt = ago(settledAgo);
  const quoteId = await addQuote(t.db, {
    state: "SETTLED",
    createdAt: new Date(settledAt.getTime() - q2s * 1000),
    updatedAt: settledAt,
  });
  await addConversion(t.db, quoteId, {
    settledAt,
    submittedAt: s2s === null ? null : new Date(settledAt.getTime() - s2s * 1000),
  });
}

describe("latency percentiles", () => {
  it("are null with nothing settled, never 0", async () => {
    const empty = { "24h": null, "7d": null, all: null };
    expect((await quoteToSettleLatency(context(t.db), "0.5")).values).toEqual(empty);
    expect((await submitToSettleLatencyP95(context(t.db))).values).toEqual(empty);
  });

  it("use percentile_cont over seconds, windowed by settled_at, at 3 places", async () => {
    for (const [i, q2s] of [10, 20, 30, 40, 50].entries())
      await settled((i + 1) * HOUR, q2s, q2s / 5);
    await settled(3 * DAY, 1000, 500); // 7 d and all
    await settled(10 * DAY, 2000, null); // all; never submitted, so not in the submit percentile
    await settled(30 * DAY, -5, null); // clock skew: counts as 0 s, all only
    // A failed quote and an unsettled conversion never count.
    const failed = await addQuote(t.db, { state: "FAILED", updatedAt: ago(HOUR) });
    await addConversion(t.db, failed, { settledAt: ago(HOUR), submittedAt: ago(HOUR + 99_000) });

    const ctx = context(t.db);
    // 24 h [10..50]: p50 30, p95 = 40 + 0.8 * 10. 7 d adds 1000: p50 35, p95 = 50 + 0.75 * 950.
    // All is [0, 10..50, 1000, 2000]: p50 35, p95 = 1000 + 0.65 * 1000.
    expect((await quoteToSettleLatency(ctx, "0.5")).values).toEqual({
      "24h": "30.000",
      "7d": "35.000",
      all: "35.000",
    });
    expect((await quoteToSettleLatency(ctx, "0.95")).values).toEqual({
      "24h": "48.000",
      "7d": "762.500",
      all: "1650.000",
    });
    // Submit to settle: 24 h [2, 4, 6, 8, 10]: p95 = 8 + 0.8 * 2. 7 d adds 500: 10 + 0.75 * 490.
    expect((await submitToSettleLatencyP95(ctx)).values).toEqual({
      "24h": "9.600",
      "7d": "377.500",
      all: "377.500",
    });
  });
});
