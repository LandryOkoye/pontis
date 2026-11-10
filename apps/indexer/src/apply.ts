// Stores core events and applies them to conversions. Safe to repeat: an event is identified by
// (receipt ID, log index), so replaying a block changes nothing.

import { auditLog, conversions, quotes, settlementEvents, type DbTx } from "@pontis/db";
import { and, eq, sql } from "drizzle-orm";
import type { CoreExecution } from "./chain-source.ts";
import { anchorsTxHash, parseEvents, type CoreEvent } from "./events.ts";
import { nonceOf, settlementFor } from "./settle.ts";

export interface ApplyResult {
  stored: number;
  /** Events already stored by an earlier pass. */
  duplicates: number;
}

async function applyEvent(tx: DbTx, execution: CoreExecution, event: CoreEvent): Promise<boolean> {
  const nonce = nonceOf(event);
  const [row] = nonce
    ? await tx
        .select({ quote: quotes, conversion: conversions })
        .from(quotes)
        .leftJoin(conversions, eq(conversions.quoteId, quotes.id))
        .where(eq(quotes.nonce, nonce))
        .for("update", { of: quotes })
    : [];
  const stored = await tx
    .insert(settlementEvents)
    .values({
      receiptId: execution.receiptId,
      logIndex: event.logIndex,
      blockHeight: execution.blockHeight,
      blockTimestamp: execution.blockTimestamp,
      // Attributed once the reported hash is verified (verify-hashes.ts); never copied from the report.
      txHash: null,
      eventName: event.name,
      data: event.data,
      conversionId: row?.conversion?.id ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: settlementEvents.id });
  if (stored.length === 0) return false;

  // A new outcome receipt is something a reported hash can be checked against: verify it again soon.
  if (row?.conversion?.reportedTxHash && anchorsTxHash(event))
    await tx
      .update(conversions)
      .set({ txHashCheckedAt: null })
      .where(eq(conversions.id, row.conversion.id));

  const settlement = row && settlementFor(row.quote, event);
  if (!row || !settlement) return true;
  const at = execution.blockTimestamp;
  await tx
    .update(quotes)
    .set({ state: settlement.to, updatedAt: at })
    .where(and(eq(quotes.id, row.quote.id), eq(quotes.state, row.quote.state)));
  if (row.conversion) {
    await tx
      .update(conversions)
      .set({
        submittedAt: sql`coalesce(${conversions.submittedAt}, ${at})`,
        ...(settlement.to === "SETTLED"
          ? { settledAt: at, failureReason: null }
          : { failureReason: settlement.reason }),
      })
      .where(eq(conversions.id, row.conversion.id));
  }
  if (settlement.to === "REQUIRES_RECONCILIATION") {
    await tx.insert(auditLog).values({
      actor: "indexer",
      action: "quote.requires_reconciliation",
      subject: row.quote.id,
      detail: { reason: settlement.reason, receiptId: execution.receiptId, eventName: event.name },
    });
  }
  return true;
}

/** Applies every event of the successful executions in one transaction. */
export async function applyExecutions(
  tx: DbTx,
  executions: readonly CoreExecution[],
): Promise<ApplyResult> {
  const result: ApplyResult = { stored: 0, duplicates: 0 };
  for (const execution of executions) {
    // A panicked receipt's state changes were reverted, so its logs describe nothing that happened.
    if (!execution.success) continue;
    for (const event of parseEvents(execution.logs)) {
      if (await applyEvent(tx, execution, event)) result.stored++;
      else result.duplicates++;
    }
  }
  return result;
}
