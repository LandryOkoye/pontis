// Quote and settlement tables (used from B10 on) plus the indexer cursor and audit log.

import type { QuoteState } from "@pontis/domain";
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { assetRepresentations } from "./registry.ts";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const u128 = (name: string) => numeric(name, { precision: 39, scale: 0 });

export const quotes = pgTable(
  "quotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text().notNull(),
    fromId: text()
      .notNull()
      .references(() => assetRepresentations.id),
    toId: text()
      .notNull()
      .references(() => assetRepresentations.id),
    amountIn: u128("amount_in").notNull(),
    amountOutGross: u128("amount_out_gross").notNull(),
    fee: u128("fee").notNull(),
    amountOut: u128("amount_out").notNull(),
    ratioNum: u128("ratio_num").notNull(),
    ratioDen: u128("ratio_den").notNull(),
    feeBps: integer().notNull(),
    /** 32 hex characters; the on-chain operation ID (ADR 0006). */
    nonce: text().notNull().unique(),
    signature: text().notNull(),
    expiresAt: at("expires_at").notNull(),
    compatibilityVersion: bigint({ mode: "number" }).notNull(),
    policyVersion: bigint({ mode: "number" }).notNull(),
    route: jsonb().$type<Record<string, unknown>>().notNull(),
    warnings: jsonb().$type<{ code: string; message: string }[]>().notNull(),
    state: text().$type<QuoteState>().notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("quotes_account_idx").on(t.accountId),
    index("quotes_state_expiry_idx").on(t.state, t.expiresAt),
  ],
);

export const conversions = pgTable("conversions", {
  id: uuid().primaryKey().defaultRandom(),
  quoteId: uuid()
    .notNull()
    .unique()
    .references(() => quotes.id),
  idempotencyKey: text().notNull().unique(),
  txHash: text(),
  failureReason: text(),
  submittedAt: at("submitted_at"),
  settledAt: at("settled_at"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const settlementEvents = pgTable(
  "settlement_events",
  {
    id: serial().primaryKey(),
    receiptId: text().notNull(),
    logIndex: integer().notNull(),
    blockHeight: bigint({ mode: "number" }).notNull(),
    blockTimestamp: at("block_timestamp").notNull(),
    txHash: text().notNull(),
    eventName: text().notNull(),
    data: jsonb().$type<unknown>().notNull(),
    conversionId: uuid().references(() => conversions.id),
  },
  (t) => [unique("settlement_events_receipt_log_key").on(t.receiptId, t.logIndex)],
);

export const auditLog = pgTable("audit_log", {
  id: serial().primaryKey(),
  actor: text().notNull(),
  action: text().notNull(),
  subject: text().notNull(),
  detail: jsonb().$type<unknown>().notNull(),
  at: at("at").notNull().defaultNow(),
});

/** One row per indexer, keyed by name; the indexer resumes from `block_height` (B12). */
export const indexerCursor = pgTable("indexer_cursor", {
  name: text().primaryKey(),
  blockHeight: bigint({ mode: "number" }).notNull(),
  blockHash: text(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});
