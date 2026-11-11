// Folds settled conversions from `settlement_events` into `trades` (ADR 0015 section 3).
// Resumable (starts after the last folded event) and idempotent (`ref` is unique).

import { settlementEvents, trades, type Db } from "@pontis/db";
import { and, asc, eq, gt, max } from "drizzle-orm";
import { z } from "zod";

const Amount = z.string().regex(/^(0|[1-9][0-9]*)$/);
/** The fields of a `conversion_completed` event a trade needs (ADR 0002). */
const CompletedSchema = z.object({
  user: z.string(),
  from_representation_id: z.string(),
  to_representation_id: z.string(),
  amount_in: Amount,
  amount_out: Amount,
  fee: Amount,
});

const BATCH = 500;

/** Returns how many new trades were stored. Events that do not parse are skipped, not fatal. */
export async function syncTrades(db: Db): Promise<number> {
  const [last] = await db
    .select({ id: max(trades.eventId) })
    .from(trades)
    .where(eq(trades.source, "pontis_trades"));
  let after = last?.id ?? 0;
  let stored = 0;
  for (;;) {
    const events = await db
      .select()
      .from(settlementEvents)
      .where(
        and(eq(settlementEvents.eventName, "conversion_completed"), gt(settlementEvents.id, after)),
      )
      .orderBy(asc(settlementEvents.id))
      .limit(BATCH);
    if (events.length === 0) return stored;
    const values = events.flatMap((event) => {
      const parsed = CompletedSchema.safeParse(event.data);
      if (!parsed.success) return [];
      const d = parsed.data;
      return [
        {
          ref: `event:${event.id}`,
          kind: "conversion",
          ts: event.blockTimestamp,
          accountId: d.user,
          fromId: d.from_representation_id,
          toId: d.to_representation_id,
          amountIn: d.amount_in,
          amountOut: d.amount_out,
          fee: d.fee,
          source: "pontis_trades" as const,
          simulated: false,
          eventId: event.id,
        },
      ];
    });
    if (values.length > 0) {
      const inserted = await db
        .insert(trades)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: trades.id });
      stored += inserted.length;
    }
    // Advance past skipped events too, so a bad row is not re-read forever.
    after = events[events.length - 1]!.id;
    if (values.length === 0 && events.length < BATCH) return stored;
  }
}
