import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  conversionSuccessRate,
  requiresReconciliationMeanTimeToResolve,
  requiresReconciliationOpen,
  requiresReconciliationRate,
} from "../src/metrics/conversion-health.ts";
import { DAY, HOUR, ago, context, seedRegistry } from "./metrics-helpers.ts";
import { addQuote, addReconciliationAudit } from "./metrics-seed.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db);
});
afterAll(() => t.drop());

describe("empty database", () => {
  it("has no rate (null, never 0) and a zero open count", async () => {
    const ctx = context(t.db);
    for (const m of [conversionSuccessRate, requiresReconciliationRate]) {
      expect((await m(ctx)).values).toEqual({ "24h": null, "7d": null, all: null });
    }
    expect((await requiresReconciliationMeanTimeToResolve(ctx)).values?.all).toBeNull();
    expect((await requiresReconciliationOpen(ctx)).value).toBe(0);
  });
});

describe("conversion health on seeded quotes", () => {
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    // Inside 24 h: 3 settled, 1 failed, 1 open requires-reconciliation; expired and quoted excluded.
    for (const [name, state, at] of [
      ["s1", "SETTLED", ago(HOUR)],
      ["s2", "SETTLED", ago(2 * HOUR)],
      ["s3", "SETTLED", ago(3 * HOUR)],
      ["f1", "FAILED", ago(4 * HOUR)],
      ["open", "REQUIRES_RECONCILIATION", ago(5 * HOUR)],
      ["expired", "EXPIRED", ago(HOUR)],
      ["quoted", "QUOTED", ago(HOUR)],
      // Between 24 h and 7 d: one settled, one failed.
      ["s4", "SETTLED", ago(3 * DAY)],
      ["f2", "FAILED", ago(4 * DAY)],
      // Older than 7 d.
      ["s5", "SETTLED", ago(10 * DAY)],
    ] as const) {
      ids[name] = await addQuote(t.db, { state, updatedAt: at });
    }
    // Resolved after reconciliation: entered 30 min before it settled (a), 90 min before it failed (b).
    ids.rrA = await addQuote(t.db, { state: "SETTLED", updatedAt: ago(6 * HOUR) });
    ids.rrB = await addQuote(t.db, { state: "FAILED", updatedAt: ago(8 * HOUR) });
    await addReconciliationAudit(t.db, ids.rrA as string, ago(6 * HOUR + 30 * 60_000));
    await addReconciliationAudit(t.db, ids.rrB as string, ago(9 * HOUR + 30 * 60_000));
    // A second audit row for the same quote must not count twice, nor move its entry time.
    await addReconciliationAudit(t.db, ids.rrB as string, ago(8 * HOUR + 1000));
    await addReconciliationAudit(t.db, ids.open as string, ago(5 * HOUR));
    // An entry outside every window but the all-time one.
    await addReconciliationAudit(t.db, ids.s5 as string, ago(10 * DAY));
  });

  it("conversion_success_rate is settled over executed, windowed by updated_at", async () => {
    // 24 h: settled s1 s2 s3 rrA = 4; executed = 4 + f1 + rrB + open = 7.
    // 7 d adds s4 and f2: 5 / 9. All adds s5: 6 / 10.
    expect((await conversionSuccessRate(context(t.db))).values).toEqual({
      "24h": "0.571429",
      "7d": "0.555556",
      all: "0.600000",
    });
  });

  it("requires_reconciliation_rate counts distinct quotes entered over executed quotes", async () => {
    // Entered: 24 h = open, rrA, rrB; all adds s5. Executed as above (7, 9, 10).
    expect((await requiresReconciliationRate(context(t.db))).values).toEqual({
      "24h": "0.428571",
      "7d": "0.333333",
      all: "0.400000",
    });
  });

  it("requires_reconciliation_open counts the state now", async () => {
    expect((await requiresReconciliationOpen(context(t.db))).value).toBe(1);
  });

  it("mean time to resolve averages first entry to updated_at over resolved quotes", async () => {
    // rrA 30 min, rrB 90 min: mean 3600 s. s5 entered and settled at the same instant: 0 s, all only.
    const v = (await requiresReconciliationMeanTimeToResolve(context(t.db))).values;
    expect(v?.["24h"]).toBe("3600.000");
    expect(v?.["7d"]).toBe("3600.000");
    expect(v?.all).toBe("2400.000");
  });

  it("flags simulated from the context", async () => {
    expect((await conversionSuccessRate(context(t.db, false))).simulated).toBe(false);
    expect((await conversionSuccessRate(context(t.db))).simulated).toBe(true);
  });
});
