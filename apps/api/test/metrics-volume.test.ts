import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { feesCollected, vaultInventory, volumeInput } from "../src/metrics/volume.ts";
import { DAY, HOUR, ago, context, seedRegistry } from "./metrics-helpers.ts";
import { addQuote } from "./metrics-seed.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.drop());

describe("empty registry", () => {
  it("has no per-representation amounts", async () => {
    expect((await vaultInventory(context(t.db))).value).toEqual({});
    expect((await volumeInput(context(t.db))).values?.all).toEqual({});
  });
});

describe("volume, fees and vault inventory", () => {
  beforeAll(() => seedRegistry(t.db));

  it("sums settled quotes per representation, by window, in base units", async () => {
    const quote = (
      state: "SETTLED" | "FAILED",
      ms: number,
      from: string,
      amountIn: string,
      fee: string,
    ) =>
      addQuote(t.db, {
        state,
        updatedAt: ago(ms),
        fromId: from,
        toId: from === "tgold-a" ? "tgold-b" : "tgold-a",
        amountIn,
        fee,
      });
    await quote("SETTLED", HOUR, "tgold-a", "1000", "10");
    await quote("SETTLED", 2 * HOUR, "tgold-a", "2000", "20");
    await quote("SETTLED", 3 * DAY, "tgold-b", "5000000000000000000000", "50");
    await quote("SETTLED", 10 * DAY, "tgold-a", "7", "1");
    await quote("FAILED", HOUR, "tgold-a", "999", "99");
    const ctx = context(t.db);
    // Beyond 2^53: amounts stay exact strings.
    expect((await volumeInput(ctx)).values).toEqual({
      "24h": { "tgold-a": "3000" },
      "7d": { "tgold-a": "3000", "tgold-b": "5000000000000000000000" },
      all: { "tgold-a": "3007", "tgold-b": "5000000000000000000000" },
    });
    // Fees are paid in the output token: the `to` side.
    expect((await feesCollected(ctx)).values).toEqual({
      "24h": { "tgold-b": "30" },
      "7d": { "tgold-b": "30", "tgold-a": "50" },
      all: { "tgold-b": "31", "tgold-a": "50" },
    });
  });

  it("reads the vault inventory now, per representation", async () => {
    const v = await vaultInventory(context(t.db));
    expect(v.value).toEqual({ "tgold-a": "1000000000", "tgold-b": "1000000000000" });
    expect(v.simulated).toBe(true);
  });
});
