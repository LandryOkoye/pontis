import { describe, expect, it } from "vitest";
import { scanNewest } from "../src/custody/paging.ts";
import { pagedOver } from "./custody-helpers.ts";

describe("scanNewest", () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, even: (i + 1) % 2 === 0 }));
  const fetch = pagedOver(items) as (
    from: number,
    limit: number,
  ) => Promise<{ items: typeof items; total: number }>;

  it("returns the newest matches first, up to `want`, scanning backwards in pages", async () => {
    const out = await scanNewest(fetch, { want: 3, cap: 500, keep: (i) => i.even });
    expect(out.items.map((i) => i.id)).toEqual([250, 248, 246]);
  });

  it("skips ids at or above `before`, so a cursor never repeats an item", async () => {
    const out = await scanNewest(fetch, { want: 2, cap: 500, before: 248, keep: (i) => i.even });
    expect(out.items.map((i) => i.id)).toEqual([246, 244]);
  });

  it("stops at the cap and says it did when older items were left unseen", async () => {
    const out = await scanNewest(fetch, { want: 5, cap: 100, keep: (i) => i.id <= 10 });
    expect(out).toEqual({ items: [], capped: true });
  });

  it("reaches the oldest item when the cap is large enough, and is not capped then", async () => {
    const out = await scanNewest(fetch, { want: 5, cap: 500, keep: (i) => i.id <= 2 });
    expect(out.items.map((i) => i.id)).toEqual([2, 1]);
    expect(out.capped).toBe(false);
  });

  it("handles an empty view", async () => {
    const none = pagedOver<{ id: number }>([]) as never;
    expect(await scanNewest(none, { want: 5, cap: 100, keep: () => true })).toEqual({
      items: [],
      capped: false,
    });
  });
});
