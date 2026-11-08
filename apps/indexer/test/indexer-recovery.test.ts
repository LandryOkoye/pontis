import { settlementEvents } from "@pontis/db";
import { describe, expect, it } from "vitest";
import { readCursor } from "../src/cursor.ts";
import { runIndexer } from "../src/indexer.ts";
import { FakeSource, silent } from "./fake-source.ts";
import { execution, useSeededDb } from "./harness.ts";

const h = useSeededDb();
// The same receipts every time a block is read, as on a real chain.
const executions = new Map(
  Array.from({ length: 6 }, (_, i) => [10 + i, execution([["fee_updated", { fee_bps: i }]])]),
);
const chain = () => {
  const source = new FakeSource(15);
  for (const [height, exec] of executions) source.put(height, exec);
  return source;
};

/** Runs the loop until `stop(waits)` says so; `waits` holds every pause the loop asked for. */
async function run(
  source: FakeSource,
  extra: { rescanBlocks: number; stop: (waits: number[]) => boolean; onWait?: (n: number) => void },
) {
  const controller = new AbortController();
  const waits: number[] = [];
  await runIndexer({
    db: h.db,
    source,
    log: silent,
    confirmations: 0,
    startHeight: 10,
    pollMs: 1000,
    rescanBlocks: extra.rescanBlocks,
    signal: controller.signal,
    sleep: async (ms) => {
      waits.push(ms);
      extra.onWait?.(waits.length);
      if (extra.stop(waits)) controller.abort();
    },
  });
  return waits;
}

describe("runIndexer", () => {
  it("backs off on RPC failures, keeps the cursor at the last good block, then catches up without loss", async () => {
    const source = chain();
    source.failAt.add(13);
    const waits = await run(source, {
      rescanBlocks: 0,
      onWait: (n) => {
        if (n === 2) source.failAt.clear();
      },
      stop: (w) => w.length === 3,
    });
    expect(waits).toEqual([1000, 2000, 1000]);
    expect(silent.errors).toHaveLength(2);
    expect(source.reads.filter((x) => x === 13)).toHaveLength(3);
    expect(await readCursor(h.db)).toBe(15);
    expect(await h.db.select().from(settlementEvents)).toHaveLength(6);
  });

  it("re-reads the blocks behind the cursor on start without storing anything twice", async () => {
    await run(chain(), { rescanBlocks: 0, stop: () => true });
    const source = chain();
    await run(source, { rescanBlocks: 4, stop: () => true });
    expect(source.reads).toEqual([12, 13, 14, 15]);
    expect(await readCursor(h.db)).toBe(15);
    expect(await h.db.select().from(settlementEvents)).toHaveLength(6);
  });
});
