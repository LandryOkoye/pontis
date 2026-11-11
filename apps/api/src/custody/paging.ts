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
