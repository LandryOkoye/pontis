// Newest-first paging over the contract's oldest-first paged views (ADR 0020 section 0). A cursor
// holds the index one past the next page's last item, so a page never overlaps the previous one
// even as new items are appended.

import type { ChainPage } from "@pontis/near-client";
import { decodeCursor, encodeCursor } from "../market/cursor.ts";

export interface NewestFirstPage<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}

/**
 * `fetch(from, limit)` is a paged view. `query` binds the cursor to the request that made it.
 * `floor` is the lowest index the chain still holds (the history ring drops older entries).
 */
export async function newestFirst<T>(
  fetch: (fromIndex: number, limit: number) => Promise<ChainPage<T>>,
  opts: {
    cursor?: string | undefined;
    limit: number;
    query: unknown;
    floor?: (total: number) => number;
  },
): Promise<NewestFirstPage<T>> {
  // One item is enough to learn the total, which fixes the newest end and the ring's floor.
  const total = (await fetch(0, 1)).total;
  const end =
    opts.cursor === undefined ? total : Math.min(decodeCursor(opts.cursor, opts.query), total);
  const floor = opts.floor?.(total) ?? 0;
  const start = Math.max(floor, end - opts.limit);
  if (end <= start) return { items: [], total, nextCursor: null };
  const page = await fetch(start, end - start);
  return {
    items: [...page.items].reverse(),
    total: page.total,
    nextCursor: start > floor ? encodeCursor(start, opts.query) : null,
  };
}

/**
 * The newest items of a paged view that satisfy `keep` and have an id below `before`, newest
 * first, scanning at most `cap` items from the newest end in pages of 100. Ids of the contract's
 * counters only grow, so "below `before`" is a stable cursor. `capped` is true when the scan
 * stopped at the cap with older items unseen.
 */
export async function scanNewest<T extends { id: number }>(
  fetch: (fromIndex: number, limit: number) => Promise<ChainPage<T>>,
  opts: { want: number; cap: number; before?: number | undefined; keep: (item: T) => boolean },
): Promise<{ items: T[]; capped: boolean }> {
  const PAGE = 100;
  const total = (await fetch(0, 1)).total;
  const items: T[] = [];
  let end = total;
  let scanned = 0;
  while (end > 0 && items.length < opts.want && scanned < opts.cap) {
    const start = Math.max(0, end - PAGE);
    const page = await fetch(start, end - start);
    scanned += end - start;
    for (const item of [...page.items].reverse()) {
      if (opts.before !== undefined && item.id >= opts.before) continue;
      if (opts.keep(item) && items.length < opts.want) items.push(item);
    }
    end = start;
  }
  return { items, capped: end > 0 && items.length < opts.want };
}
