// Custody, reserves and signer keys (ADR 0020 sections 1 to 5 and 10): chain state copied into
// Postgres by the indexer. The chain is the authority; every table can be rebuilt by replaying the
// events. Keys are plain text IDs with no foreign key to the registry mirror, because the registry
// sync replaces that mirror. Every figure a signer vouched for carries `simulated` and `source`;
// nothing here says a reserve is verified, custodied or audited.

import { sql } from "drizzle-orm";
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
} from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const u128 = (name: string) => numeric(name, { precision: 39, scale: 0 });

export type CustodianStatus = "active" | "suspended" | "retired";
export type CustodyStructure = "segregated" | "omnibus" | "on_chain_vault";
export type ReserveState = "ok" | "breached" | "stale" | "no_attestation";
export type ReserveAction = "warn" | "restrict_conversions" | "pause_mint";
export type AttesterRole = "attester" | "reserve_attester" | "bridge_attester";

/** A custodian's evidence reference as the chain stores it (ADR 0009). */
export interface CustodianEvidence {
  uri: string;
  sha256: string;
  provenance: string;
  description: string;
  added_by: string;
  timestamp_ms: number;
}

/**
 * `custodian_registered` carries only the ID and the attester key, so the rest stays null until the
 * indexer has read `get_custodian` (`needs_refresh` marks the rows still waiting for that).
 */
export const custodians = pgTable("custodians", {
  id: text().primaryKey(),
  name: text(),
  jurisdiction: text(),
  attesterKey: text().notNull(),
  status: text().$type<CustodianStatus>().notNull(),
  synthetic: boolean(),
  verificationStatus: text(),
  evidence: jsonb().$type<CustodianEvidence[]>(),
  registeredBy: text().notNull(),
  registeredAt: at("registered_at").notNull(),
  updatedAt: at("updated_at").notNull(),
  needsRefresh: boolean().notNull().default(true),
  refreshedAt: at("refreshed_at"),
});

export const custodyLinks = pgTable("custody_links", {
  representationId: text().primaryKey(),
  structure: text().$type<CustodyStructure>().notNull(),
  custodianIds: jsonb().$type<string[]>().notNull(),
  linkedBy: text().notNull(),
  linkedAt: at("linked_at").notNull(),
});

/** The latest policy per representation; its presence is what makes a representation monitored. */
export const reservePolicies = pgTable("reserve_policies", {
  representationId: text().primaryKey(),
  toleranceBps: integer().notNull(),
  maxReserveAgeMs: bigint({ mode: "number" }).notNull(),
  action: text().$type<ReserveAction>().notNull(),
  baselineSupply: u128("baseline_supply").notNull(),
  setBy: text().notNull(),
  setAt: at("set_at").notNull(),
});

/** Every `reserve_attested` event: the unbounded history the chain's 500-entry ring drops. */
export const reserveAttestations = pgTable(
  "reserve_attestations",
  {
    id: serial().primaryKey(),
    receiptId: text().notNull(),
    logIndex: integer().notNull(),
    blockHeight: bigint({ mode: "number" }).notNull(),
    representationId: text().notNull(),
    custodianId: text().notNull(),
    /** Smallest units of the representation token, the unit of its total supply. */
    reservedUnits: u128("reserved_units").notNull(),
    asOf: at("as_of").notNull(),
    reportHash: text().notNull(),
    reportUri: text().notNull(),
    simulated: boolean().notNull(),
    source: text().notNull(),
    attesterKey: text().notNull(),
    /** The contract's per-representation sequence number. */
    seq: bigint({ mode: "number" }).notNull(),
    submittedAt: at("submitted_at").notNull(),
  },
  (t) => [
    unique("reserve_attestations_receipt_log_key").on(t.receiptId, t.logIndex),
    index("reserve_attestations_rep_seq_idx").on(t.representationId, t.seq),
    index("reserve_attestations_rep_custodian_idx").on(t.representationId, t.custodianId, t.asOf),
  ],
);

/** Every `reserve_supply_read`: the token supply the contract stored for its invariant. */
export const reserveSupplyReads = pgTable(
  "reserve_supply_reads",
  {
    id: serial().primaryKey(),
    receiptId: text().notNull(),
    logIndex: integer().notNull(),
    blockHeight: bigint({ mode: "number" }).notNull(),
    representationId: text().notNull(),
    supply: u128("supply").notNull(),
    readAt: at("read_at").notNull(),
    /** The supply is the synthetic test token's, read from the chain by the contract. */
    simulated: boolean().notNull().default(true),
    source: text().notNull().default("chain_view"),
  },
  (t) => [
    unique("reserve_supply_reads_receipt_log_key").on(t.receiptId, t.logIndex),
    index("reserve_supply_reads_rep_idx").on(t.representationId, t.readAt),
  ],
);

/** The result of `get_reserve_status`, as the contract returns it (ADR 0020 section 5). */
export interface ChainReserveStatusSnapshot {
  monitored: boolean;
  state: ReserveState | "unmonitored";
  action: ReserveAction | null;
  tolerance_bps: number;
  max_reserve_age_ms: number;
  attested_units: string;
  limit_units: string;
  circulating_units: string;
  headroom_units: string;
  ratio_bps: number | null;
  oldest_as_of_ms: number | null;
  age_ms: number | null;
  supply_read_ms: number | null;
  restricts_conversions: boolean;
  mint_paused: boolean;
  simulated: boolean;
  sources: string[];
}

/**
 * One row per representation. The event columns (`state` to `changedAt`) come only from
 * `reserve_status_changed`; `chainStatus` is a snapshot of `get_reserve_status` taken by the
 * reserve monitor, kept apart so the reconciler can tell a breach the indexer has not seen from
 * one it has.
 */
export const reserveStatus = pgTable("reserve_status", {
  representationId: text().primaryKey(),
  state: text().$type<ReserveState>().notNull(),
  action: text().$type<ReserveAction>(),
  attestedUnits: u128("attested_units").notNull(),
  circulatingUnits: u128("circulating_units").notNull(),
  ratioBps: integer(),
  changedAt: at("changed_at").notNull(),
  chainStatus: jsonb().$type<ChainReserveStatusSnapshot>(),
  chainRefreshedAt: at("chain_refreshed_at"),
  /** True once any contributing attestation is simulated; true until a snapshot says otherwise. */
  simulated: boolean().notNull().default(true),
  sources: jsonb()
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
});

/** One row per `(role, public_key)`; a removed key keeps its row with `removed_at` set. */
export const signerKeys = pgTable(
  "signer_keys",
  {
    role: text().$type<AttesterRole>().notNull(),
    publicKey: text().notNull(),
    accountId: text().notNull(),
    scopes: jsonb().$type<string[]>().notNull(),
    addedBy: text().notNull(),
    addedAt: at("added_at").notNull(),
    removedBy: text(),
    removedAt: at("removed_at"),
  },
  (t) => [primaryKey({ columns: [t.role, t.publicKey] })],
);

/** What one reserve monitor pass saw of a monitored representation. */
export interface ReserveMonitorEntry {
  representationId: string;
  /** From `get_reserve_status`; null when that read failed. */
  state: ReserveState | null;
  action: ReserveAction | null;
  attestedUnits: string | null;
  circulatingUnits: string | null;
  limitUnits: string | null;
  ratioBps: number | null;
  ageMs: number | null;
  maxReserveAgeMs: number;
  /** The signed refresh and evaluation transactions; false when they failed or no signer is set. */
  refreshedSupply: boolean;
  evaluated: boolean;
  simulated: boolean;
  sources: string[];
  error: string | null;
}

/** The monitor's latest pass; `GET /v1/admin/reserve-monitor` serves it. */
export interface ReserveMonitorReport {
  ranAt: string;
  /** The account that signed refresh and evaluation calls; null when the monitor only reads. */
  signer: string | null;
  simulated: true;
  source: "reserve_monitor";
  entries: ReserveMonitorEntry[];
  breaches: string[];
  stale: string[];
  /** Representations whose reads or calls failed this pass. */
  failed: string[];
}

export const reserveMonitorReport = pgTable("reserve_monitor_report", {
  name: text().primaryKey(),
  report: jsonb().$type<ReserveMonitorReport>().notNull(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});
