import { indexerCursor } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { secondsFromMs } from "../src/metrics/core.ts";
import { indexerHeartbeatAge, indexerLagBlocks } from "../src/metrics/latency.ts";
import { NOW, ago, context } from "./metrics-helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.drop());

describe("indexer lag and heartbeat", () => {
  const cursor = (blockHeight: number, updatedAt: Date) =>
    t.db
      .insert(indexerCursor)
      .values({ name: "indexer", blockHeight, updatedAt })
      .onConflictDoUpdate({ target: indexerCursor.name, set: { blockHeight, updatedAt } });

  it("are null before the indexer ever ran", async () => {
    expect((await indexerLagBlocks(context(t.db), async () => 5)).value).toBeNull();
    expect((await indexerHeartbeatAge(context(t.db))).value).toBeNull();
  });

  it("lag is head minus cursor, clamped at 0, and null when the chain head fails", async () => {
    await cursor(100, ago(12_500));
    expect((await indexerLagBlocks(context(t.db), async () => 105)).value).toBe(5);
    expect((await indexerLagBlocks(context(t.db), async () => 90)).value).toBe(0);
    const failing = await indexerLagBlocks(context(t.db), async () => {
      throw new Error("rpc down");
    });
    expect(failing.value).toBeNull();
  });

  it("heartbeat age is seconds at 3 places from the injected clock, clamped at 0", async () => {
    expect((await indexerHeartbeatAge(context(t.db))).value).toBe("12.500");
    await cursor(100, new Date(NOW.getTime() + 2000));
    expect((await indexerHeartbeatAge(context(t.db))).value).toBe("0.000");
    expect(secondsFromMs(1)).toBe("0.001");
    expect(secondsFromMs(3_600_000)).toBe("3600.000");
  });
});
