// Recent conversions involving an asset (brief section 12.1, screen 3, Activity tab).

import type { ActivityItem } from "@pontis/api-types";
import { trades, type Db } from "@pontis/db";
import type { DataFilter } from "@pontis/domain";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { representation } from "./detail.ts";

export async function assetActivity(
  db: Db,
  id: string,
  query: { data: DataFilter; limit: number; cursor?: string | undefined },
): Promise<{ items: ActivityItem[]; nextCursor: string | null } | undefined> {
  if (!(await representation(db, id))) return undefined;
  const identity = { id, data: query.data, limit: query.limit };
  const offset = query.cursor ? decodeCursor(query.cursor, identity) : 0;
  const classes =
    query.data === "real" ? [false] : query.data === "simulated" ? [true] : [false, true];
  const rows = await db
    .select()
    .from(trades)
    .where(and(or(eq(trades.fromId, id), eq(trades.toId, id)), inArray(trades.simulated, classes)))
    .orderBy(desc(trades.ts), desc(trades.id))
    .limit(query.limit + 1)
    .offset(offset);
  return {
    items: rows.slice(0, query.limit).map((r) => ({
      kind: "conversion" as const,
      at: r.ts.toISOString(),
      accountId: r.accountId,
      fromId: r.fromId,
      toId: r.toId,
      amountIn: r.amountIn,
      amountOut: r.amountOut,
      fee: r.fee,
      source: r.source,
      simulated: r.simulated,
    })),
    nextCursor: rows.length > query.limit ? encodeCursor(offset + query.limit, identity) : null,
  };
}
