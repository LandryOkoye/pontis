// Trading rows for the metrics tests at chosen times: quotes, conversions, settlement events and
// audit rows, on top of the fixture registry.

import { auditLog, conversions, quotes, settlementEvents, type Db } from "@pontis/db";
import type { QuoteState } from "@pontis/domain";
import { randomBytes, randomUUID } from "node:crypto";
import { ago, HOUR } from "./metrics-helpers.ts";

export interface QuoteSeed {
  state: QuoteState;
  /** When the quote last changed state; also `created_at` unless given. */
  updatedAt?: Date;
  createdAt?: Date;
  fromId?: string;
  toId?: string;
  amountIn?: string;
  fee?: string;
}

export async function addQuote(db: Db, q: QuoteSeed): Promise<string> {
  const updatedAt = q.updatedAt ?? ago(HOUR);
  const [row] = await db
    .insert(quotes)
    .values({
      accountId: "alice.testnet",
      fromId: q.fromId ?? "tgold-a",
      toId: q.toId ?? "tgold-b",
      amountIn: q.amountIn ?? "1000",
      amountOutGross: "1000000",
      fee: q.fee ?? "10",
      amountOut: "999990",
      ratioNum: "1000",
      ratioDen: "1",
      feeBps: 10,
      nonce: randomBytes(16).toString("hex"),
      signature: "sig",
      expiresAt: new Date(updatedAt.getTime() + 60_000),
      compatibilityVersion: 1,
      policyVersion: 1,
      route: {},
      warnings: [],
      state: q.state,
      createdAt: q.createdAt ?? updatedAt,
      updatedAt,
    })
    .returning({ id: quotes.id });
  return (row as { id: string }).id;
}

export async function addConversion(
  db: Db,
  quoteId: string,
  c: { submittedAt?: Date | null; settledAt?: Date | null; failureReason?: string },
): Promise<string> {
  const [row] = await db
    .insert(conversions)
    .values({
      quoteId,
      idempotencyKey: randomUUID(),
      submittedAt: c.submittedAt ?? null,
      settledAt: c.settledAt ?? null,
      failureReason: c.failureReason ?? null,
    })
    .returning({ id: conversions.id });
  return (row as { id: string }).id;
}

let receipt = 0;
export async function addEvent(
  db: Db,
  eventName: string,
  blockTimestamp: Date,
  conversionId: string | null = null,
): Promise<void> {
  await db.insert(settlementEvents).values({
    receiptId: `receipt-${receipt++}`,
    logIndex: 0,
    blockHeight: 1,
    blockTimestamp,
    eventName,
    data: {},
    conversionId,
  });
}

export async function addReconciliationAudit(db: Db, quoteId: string, at: Date): Promise<void> {
  await db.insert(auditLog).values({
    actor: "indexer",
    action: "quote.requires_reconciliation",
    subject: quoteId,
    detail: {},
    at,
  });
}
