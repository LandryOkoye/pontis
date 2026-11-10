// `indexer_cursor.updated_at` is the indexer's heartbeat, read by the API's health route: a
// successful pass stamps it even when there is nothing new, a failed pass never does.

import { indexerCursor } from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CURSOR_NAME, readCursor } from "../src/cursor.ts";
import { indexOnce } from "../src/indexer.ts";
import { FakeSource, silent } from "./fake-source.ts";
import { useSeededDb } from "./harness.ts";

const OLD = new Date("2026-01-01T00:00:00Z");

class FinalHeightDown extends FakeSource {
  override async finalHeight(): Promise<number> {
    throw new Error("rpc down");
  }
}

describe("indexer heartbeat", () => {
  const h = useSeededDb();
  const run = (source: FakeSource) =>
    indexOnce({ db: h.db, source, log: silent, confirmations: 2, startHeight: 100 });
  const row = async () =>
    (await h.db.select().from(indexerCursor).where(eq(indexerCursor.name, CURSOR_NAME)))[0]!;
  const age = (when: Date) =>
    h.db.update(indexerCursor).set({ updatedAt: when }).where(eq(indexerCursor.name, CURSOR_NAME));

  it("stamps the first cursor at the epoch and the first successful pass refreshes it", async () => {
    const source = new FakeSource(110);
    source.failAt.add(100);
    await expect(run(source)).rejects.toThrow("rpc down at 100");
    expect((await row()).updatedAt).toEqual(new Date(0));
    expect(await readCursor(h.db)).toBe(99);

    source.failAt.clear();
    await run(source);
    expect(await readCursor(h.db)).toBe(108);
    expect((await row()).updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("refreshes the heartbeat on a successful pass with no new blocks, leaving the height alone", async () => {
    await age(OLD);
    const source = new FakeSource(110); // safe head 108 equals the cursor
    expect((await run(source)).stored).toBe(0);
    expect(source.reads).toEqual([]);
    const after = await row();
    expect(after.blockHeight).toBe(108);
    expect(after.updatedAt.getTime()).toBeGreaterThan(OLD.getTime() + 1_000_000);
  });

  it("does not refresh the heartbeat when a block read fails", async () => {
    await age(OLD);
    const source = new FakeSource(115);
    source.failAt.add(109);
    await expect(run(source)).rejects.toThrow("rpc down at 109");
    const after = await row();
    expect(after.updatedAt).toEqual(OLD);
    expect(after.blockHeight).toBe(108);
  });

  it("does not refresh the heartbeat when the chain height cannot be read", async () => {
    await age(OLD);
    await expect(run(new FinalHeightDown(115))).rejects.toThrow("rpc down");
    expect((await row()).updatedAt).toEqual(OLD);
  });

  it("refreshes the heartbeat when blocks are applied", async () => {
    await age(OLD);
    await run(new FakeSource(115));
    const after = await row();
    expect(after.blockHeight).toBe(113);
    expect(after.updatedAt.getTime()).toBeGreaterThan(OLD.getTime() + 1_000_000);
  });
});
