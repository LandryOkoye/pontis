import { settlementEvents } from "@pontis/db";
import { describe, expect, it } from "vitest";
import { readCursor } from "../src/cursor.ts";
import { indexOnce } from "../src/indexer.ts";
import { FakeSource, silent } from "./fake-source.ts";
import { execution, useSeededDb } from "./harness.ts";

const h = useSeededDb();
const fee = (bps: number) => execution([["fee_updated", { fee_bps: bps, by: "owner.testnet" }]]);
const options = (source: FakeSource, over: { startHeight?: number } = {}) => ({
  db: h.db,
  source,
  log: silent,
  confirmations: 2,
  ...over,
});

describe("indexOnce", () => {
  it("reads from the start height to the safe head and stores the cursor", async () => {
    const source = new FakeSource(112);
    source.put(100, fee(1));
    source.put(105, fee(2), fee(3));
    const pass = await indexOnce(options(source, { startHeight: 100 }));
    expect([pass.from, pass.to, pass.stored]).toEqual([100, 110, 3]);
    expect(source.reads).toEqual(Array.from({ length: 11 }, (_, i) => 100 + i));
    expect(await readCursor(h.db)).toBe(110);
    expect(await h.db.select().from(settlementEvents)).toHaveLength(3);
  });

  it("resumes from the cursor and reads only blocks that are new", async () => {
    const source = new FakeSource(115);
    source.put(112, fee(4));
    const pass = await indexOnce(options(source));
    expect([pass.from, pass.to, pass.stored]).toEqual([111, 113, 1]);
    expect(source.reads).toEqual([111, 112, 113]);
    expect(await readCursor(h.db)).toBe(113);
    expect((await indexOnce(options(source))).stored).toBe(0);
    expect(source.reads).toHaveLength(3);
  });
});

describe("indexOnce on a fresh database", () => {
  const fresh = useSeededDb();

  it("starts at the chain head instead of replaying history", async () => {
    const source = new FakeSource(500);
    source.put(10, fee(9));
    const pass = await indexOnce({ db: fresh.db, source, log: silent, confirmations: 2 });
    expect(pass.stored).toBe(0);
    expect(source.reads).toEqual([]);
    expect(await readCursor(fresh.db)).toBe(498);
  });
});
