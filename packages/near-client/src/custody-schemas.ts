// Shapes returned by the custody, reserve, mint and redemption views of pontis-core (ADR 0020).
// Field names are the contract's snake_case; u128 amounts are decimal strings and times are
// milliseconds since epoch. Parsed at runtime so a contract and client that drift apart fail
// loudly instead of corrupting a mirror or showing a wrong reserve figure.

import {
  CUSTODIAN_STATUSES,
  CUSTODY_STRUCTURES,
  MINT_REQUEST_STATUSES,
  REDEMPTION_MISSES,
  REDEMPTION_STATUSES,
  RESERVE_POLICY_ACTIONS,
  RESERVE_STATES,
  VERIFICATION_STATUSES,
} from "@pontis/domain";
import { z } from "zod";
import { ChainEvidenceSchema } from "./schemas.ts";

const accountId = z.string().min(2).max(64);
const amount = z.string().regex(/^(0|[1-9][0-9]*)$/);
const timestampMs = z.number().int().nonnegative();
const hash64 = z.string().regex(/^[0-9a-f]{64}$/);
const count = z.number().int().nonnegative();

/** The paged view envelope: newest last, `total` is the count of items ever stored (ADR 0020 section 0). */
export const pagedOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), total: count });

export const ChainCustodianSchema = z.object({
  id: z.string(),
  name: z.string(),
  jurisdiction: z.string().nullable(),
  /** `ed25519:<base58>`: the key whose signature the contract accepts for this custodian's reserves. */
  attester_key: z.string(),
  status: z.enum(CUSTODIAN_STATUSES),
  synthetic: z.boolean(),
  verification_status: z.enum(VERIFICATION_STATUSES),
  evidence: z.array(ChainEvidenceSchema),
  registered_by: accountId,
  registered_at_ms: timestampMs,
});

export const ChainCustodyLinkSchema = z.object({
  representation_id: z.string(),
  structure: z.enum(CUSTODY_STRUCTURES),
  custodian_ids: z.array(z.string()).min(1).max(4),
  linked_by: accountId,
  linked_at_ms: timestampMs,
});

/** One stored attestation (`ReserveRecord`): the signed figure and the label the signer put on it. */
export const ChainReserveRecordSchema = z.object({
  seq: count,
  custodian_id: z.string(),
  /** Smallest units of the representation token, the unit of `ft_total_supply`. */
  reserved_units: amount,
  as_of_ms: timestampMs,
  submitted_ms: timestampMs,
  report_hash: hash64,
  report_uri: z.string(),
  simulated: z.boolean(),
  source: z.string().max(64),
  attester_key: z.string(),
});

export const ChainReserveStatusSchema = z.object({
  monitored: z.boolean(),
  state: z.enum(RESERVE_STATES),
  action: z.enum(RESERVE_POLICY_ACTIONS).nullable(),
  tolerance_bps: z.number().int().min(0).max(1_000),
  max_reserve_age_ms: timestampMs,
  attested_units: amount,
  limit_units: amount,
  circulating_units: amount,
  headroom_units: amount,
  /** `floor(attested * 10_000 / circulating)`; null while nothing circulates. */
  ratio_bps: z.number().int().nonnegative().nullable(),
  oldest_as_of_ms: timestampMs.nullable(),
  age_ms: timestampMs.nullable(),
  supply_read_ms: timestampMs.nullable(),
  restricts_conversions: z.boolean(),
  mint_paused: z.boolean(),
  /** True when any contributing attestation is simulated. */
  simulated: z.boolean(),
  sources: z.array(z.string()),
});

/** The supply the contract trusts (`get_supply`, ADR 0020 section 4). */
export const ChainSupplySchema = z.object({
  ledger: amount,
  pending: amount,
  read: z.object({ units: amount, as_of_ms: timestampMs }).nullable(),
  circulating: amount,
});

export const ChainMintHeadroomSchema = z.object({
  headroom_units: amount,
  circulating_units: amount,
  attested_units: amount,
  state: z.enum(RESERVE_STATES),
});

export const ChainMintRequestSchema = z.object({
  id: count,
  representation_id: z.string(),
  recipient: accountId,
  amount,
  reference: z.string().max(64),
  status: z.enum(MINT_REQUEST_STATUSES),
  requested_by: accountId,
  requested_ms: timestampMs,
  resolved_ms: timestampMs.nullable(),
  failure: z.string().nullable(),
});

export const ChainRedemptionTermsBodySchema = z.object({
  min_amount: amount,
  /** 0 means no maximum. */
  max_amount: amount,
  fee_bps: z.number().int().min(0).max(1_000),
  window_anchor_ms: timestampMs,
  window_length_ms: timestampMs,
  /** 0 means the window is always open. */
  window_period_ms: timestampMs,
  accept_within_ms: timestampMs,
  settlement_days: z.number().int().min(1).max(30),
});

/** `get_redemption_terms`: the stored, enforced terms with their version and hash. */
export const ChainRedemptionTermsSchema = z.object({
  terms: ChainRedemptionTermsBodySchema,
  version: z.number().int().positive(),
  terms_hash: hash64,
  set_by: accountId,
  set_ms: timestampMs,
});

export const ChainRedemptionSchema = z.object({
  id: count,
  user: accountId,
  representation_id: z.string(),
  issuer_id: z.string(),
  amount,
  fee_bps: z.number().int().min(0).max(1_000),
  fee_units: amount,
  net_units: amount,
  terms_hash: hash64,
  terms_version: z.number().int().positive(),
  payout_instruction_hash: hash64,
  status: z.enum(REDEMPTION_STATUSES),
  created_ms: timestampMs,
  accept_deadline_ms: timestampMs,
  accepted_ms: timestampMs.nullable(),
  fulfil_deadline_ms: timestampMs.nullable(),
  resolved_ms: timestampMs.nullable(),
  fulfilment_evidence_hash: hash64.nullable(),
  reject_reason: z.string().nullable(),
  miss: z.enum(REDEMPTION_MISSES).nullable(),
  settlement_days: z.number().int().min(1).max(30),
});

/** `get_escrow_ledger`: `held = escrowed_in - burned - returned`, and `held == open_amount` (ADR 0020 section 7). */
export const ChainEscrowLedgerSchema = z.object({
  escrowed_in: amount,
  burned: amount,
  returned: amount,
  held: amount,
  open_amount: amount,
});

export const ChainIssuerReliabilitySchema = z.object({
  issuer_id: z.string(),
  requested: count,
  accepted: count,
  fulfilled: count,
  rejected: count,
  expired: count,
  accept_misses: count,
  fulfil_misses: count,
  reclaimed: count,
  /** Summed over accepted (accept latency) and fulfilled (settle latency) requests, for averages. */
  accept_latency_ms_total: amount,
  settle_latency_ms_total: amount,
  last_miss_ms: timestampMs.nullable(),
  simulated: z.boolean(),
});

export type ChainCustodian = z.infer<typeof ChainCustodianSchema>;
export type ChainCustodyLink = z.infer<typeof ChainCustodyLinkSchema>;
export type ChainReserveRecord = z.infer<typeof ChainReserveRecordSchema>;
export type ChainReserveStatus = z.infer<typeof ChainReserveStatusSchema>;
export type ChainSupply = z.infer<typeof ChainSupplySchema>;
export type ChainMintHeadroom = z.infer<typeof ChainMintHeadroomSchema>;
export type ChainMintRequest = z.infer<typeof ChainMintRequestSchema>;
export type ChainRedemptionTermsBody = z.infer<typeof ChainRedemptionTermsBodySchema>;
export type ChainRedemptionTerms = z.infer<typeof ChainRedemptionTermsSchema>;
export type ChainRedemption = z.infer<typeof ChainRedemptionSchema>;
export type ChainEscrowLedger = z.infer<typeof ChainEscrowLedgerSchema>;
export type ChainIssuerReliability = z.infer<typeof ChainIssuerReliabilitySchema>;
export interface ChainPage<T> {
  items: T[];
  total: number;
}
