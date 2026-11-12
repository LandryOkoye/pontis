// Gated mint and redemption (ADR 0020 sections 6, 7 and 10): chain state copied into Postgres by
// the indexer. The chain is the authority; `redemptions` is the current row, `redemption_events`
// the timeline. Redemption pays no value: fee and net are figures the issuer owes off-chain, and
// every issuer is a demo issuer, so reliability counters are labelled simulated.

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const u128 = (name: string) => numeric(name, { precision: 39, scale: 0 });

export type MintRequestStatus = "requested" | "minting" | "minted" | "failed" | "cancelled";
export type RedemptionStatus =
  "requested" | "accepted" | "fulfilled" | "rejected" | "expired" | "reclaimed";
export type RedemptionMiss = "accept" | "fulfil";
/** One row of `redemption_events` per contract event about a redemption. */
export type RedemptionEventKind =
  | "requested"
  | "accepted"
  | "rejected"
  | "fulfilled"
  | "fulfil_failed"
  | "expired"
  | "reclaimed"
  | "reclaim_failed";

/**
 * Keyed by the contract's `u64` id. `execute_mint` emits no event, so the indexer reads the chain
 * to see `minting` and to close a request whose completion event it missed.
 */
export const mintRequests = pgTable(
  "mint_requests",
  {
    id: bigint({ mode: "number" }).primaryKey(),
    representationId: text().notNull(),
    recipient: text().notNull(),
    amount: u128("amount").notNull(),
    reference: text().notNull(),
    status: text().$type<MintRequestStatus>().notNull(),
    requestedBy: text().notNull(),
    requestedAt: at("requested_at").notNull(),
    resolvedAt: at("resolved_at"),
    failure: text(),
  },
  (t) => [index("mint_requests_rep_idx").on(t.representationId, t.id)],
);

/** Every version of a representation's enforced terms; a request keeps the version it was made under. */
export const redemptionTerms = pgTable(
  "redemption_terms",
  {
    representationId: text().notNull(),
    version: bigint({ mode: "number" }).notNull(),
    termsHash: text().notNull(),
    minAmount: u128("min_amount").notNull(),
    /** 0 means no maximum. */
    maxAmount: u128("max_amount").notNull(),
    feeBps: integer().notNull(),
    windowAnchorMs: bigint({ mode: "number" }).notNull(),
    windowLengthMs: bigint({ mode: "number" }).notNull(),
    /** 0 means always open. */
    windowPeriodMs: bigint({ mode: "number" }).notNull(),
    acceptWithinMs: bigint({ mode: "number" }).notNull(),
    settlementDays: integer().notNull(),
    setBy: text().notNull(),
    setAt: at("set_at").notNull(),
    receiptId: text().notNull(),
    logIndex: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.representationId, t.version] }),
    unique("redemption_terms_receipt_log_key").on(t.receiptId, t.logIndex),
  ],
);

export const redemptions = pgTable(
  "redemptions",
  {
    id: bigint({ mode: "number" }).primaryKey(),
    userAccountId: text().notNull(),
    representationId: text().notNull(),
    issuerId: text().notNull(),
    /** Escrowed in full; burned on fulfilment. */
    amount: u128("amount").notNull(),
    feeBps: integer().notNull(),
    /** What the issuer keeps and owes the net of off-chain; the contract moves no value. */
    feeUnits: u128("fee_units").notNull(),
    netUnits: u128("net_units").notNull(),
    termsHash: text().notNull(),
    termsVersion: bigint({ mode: "number" }).notNull(),
    payoutInstructionHash: text().notNull(),
    status: text().$type<RedemptionStatus>().notNull(),
    createdAt: at("created_at").notNull(),
    acceptDeadlineAt: at("accept_deadline_at").notNull(),
    acceptedAt: at("accepted_at"),
    fulfilDeadlineAt: at("fulfil_deadline_at"),
    resolvedAt: at("resolved_at"),
    fulfilmentEvidenceHash: text(),
    rejectReason: text(),
    miss: text().$type<RedemptionMiss>(),
  },
  (t) => [
    index("redemptions_user_idx").on(t.userAccountId, t.id),
    index("redemptions_rep_status_idx").on(t.representationId, t.status),
    index("redemptions_status_deadlines_idx").on(t.status, t.acceptDeadlineAt, t.fulfilDeadlineAt),
  ],
);

export const redemptionEvents = pgTable(
  "redemption_events",
  {
    id: serial().primaryKey(),
    redemptionId: bigint({ mode: "number" }).notNull(),
    kind: text().$type<RedemptionEventKind>().notNull(),
    at: at("at").notNull(),
    receiptId: text().notNull(),
    logIndex: integer().notNull(),
    blockHeight: bigint({ mode: "number" }).notNull(),
    /** Only a hash that was checked against the chain; the indexer reads receipts, which do not name it, so it stays null. */
    txHash: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    unique("redemption_events_receipt_log_key").on(t.receiptId, t.logIndex),
    index("redemption_events_redemption_idx").on(t.redemptionId, t.at),
  ],
);

/**
 * Counters from `get_issuer_reliability` (the score is derived by the API). Refreshed whenever a
 * redemption event names the issuer, which sets `needs_refresh` until the chain has been read.
 */
export const issuerReliability = pgTable("issuer_reliability", {
  issuerId: text().primaryKey(),
  requested: integer().notNull().default(0),
  accepted: integer().notNull().default(0),
  fulfilled: integer().notNull().default(0),
  rejected: integer().notNull().default(0),
  expired: integer().notNull().default(0),
  acceptMisses: integer().notNull().default(0),
  fulfilMisses: integer().notNull().default(0),
  reclaimed: integer().notNull().default(0),
  acceptLatencyMsTotal: u128("accept_latency_ms_total").notNull().default("0"),
  settleLatencyMsTotal: u128("settle_latency_ms_total").notNull().default("0"),
  lastMissAt: at("last_miss_at"),
  simulated: boolean().notNull().default(true),
  needsRefresh: boolean().notNull().default(true),
  refreshedAt: at("refreshed_at"),
});

/**
 * The encrypted payout instruction of a redemption, stored exactly as the client sent it and never
 * read (ADR 0020 section 10): the demo has nothing to pay and no key to open it with. Only
 * `payout_instruction_hash` (SHA-256 of the decoded ciphertext) goes on chain. No endpoint lists
 * or returns the ciphertext. `redemption_id` is set by the indexer when the matching
 * `redemption_requested` event arrives; a row that never gets one is a prepared request the user
 * did not send.
 */
export const redemptionPayoutInstructions = pgTable(
  "redemption_payout_instructions",
  {
    /** The prepare id: what `POST /v1/redemptions/prepare` stored this under. */
    id: uuid().primaryKey().defaultRandom(),
    accountId: text().notNull(),
    representationId: text().notNull(),
    amount: u128("amount").notNull(),
    termsHash: text().notNull(),
    payoutInstructionHash: text().notNull(),
    /** Base64 of the ciphertext, as sent. */
    ciphertext: text().notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    redemptionId: bigint({ mode: "number" }),
  },
  (t) => [
    index("redemption_payout_hash_idx").on(t.accountId, t.payoutInstructionHash),
    index("redemption_payout_redemption_idx").on(t.redemptionId),
  ],
);

/** One row per `redemption_refused` event: the escrow came straight back and no redemption exists. */
export const redemptionRefusals = pgTable(
  "redemption_refusals",
  {
    id: serial().primaryKey(),
    receiptId: text().notNull(),
    logIndex: integer().notNull(),
    blockHeight: bigint({ mode: "number" }).notNull(),
    /** `UNKNOWN_TOKEN`, `INVALID_MSG`, `PAUSED`, `TERMS_CHANGED`, `BELOW_MIN`, ... as the contract names it. */
    reason: text().notNull(),
    senderId: text().notNull(),
    token: text().notNull(),
    amount: u128("amount").notNull(),
    at: at("at").notNull(),
  },
  (t) => [
    unique("redemption_refusals_receipt_log_key").on(t.receiptId, t.logIndex),
    index("redemption_refusals_sender_idx").on(t.senderId, t.at),
  ],
);
