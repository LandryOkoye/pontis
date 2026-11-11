// The payloads of the custody, reserve, mint, redemption and signer-key events (ADR 0019 section 2,
// ADR 0020), as the contract emits them. A payload that does not match is reported, never guessed at:
// a contract change must not silently desynchronise the mirror.

import { z } from "zod";
import type { CoreEvent } from "../events.ts";

const account = z.string().min(1);
const id = z.number().int().nonnegative();
/** Milliseconds since the epoch; JSON numbers on the wire. */
const ms = z.number().int().nonnegative();
/** `U128` is a decimal string. */
const units = z.string().regex(/^(0|[1-9][0-9]*)$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const attesterRole = z.enum(["attester", "reserve_attester", "bridge_attester"]);
const reserveState = z.enum(["ok", "breached", "stale", "no_attestation"]);
const reserveAction = z.enum(["warn", "restrict_conversions", "pause_mint"]);

const SCHEMAS = {
  signer_key_added: z.object({
    role: attesterRole,
    account_id: account,
    public_key: z.string().min(1),
    scopes: z.array(z.string()),
    by: account,
    timestamp_ms: ms,
  }),
  signer_key_removed: z.object({
    role: attesterRole,
    account_id: account,
    public_key: z.string().min(1),
    by: account,
    timestamp_ms: ms,
  }),
  custodian_registered: z.object({
    id: account,
    attester_key: z.string().min(1),
    by: account,
    timestamp_ms: ms,
  }),
  custodian_status_changed: z.object({
    id: account,
    from: z.enum(["active", "suspended", "retired"]),
    to: z.enum(["active", "suspended", "retired"]),
    by: account,
    timestamp_ms: ms,
  }),
  custodian_key_set: z.object({
    id: account,
    attester_key: z.string().min(1),
    by: account,
    timestamp_ms: ms,
  }),
  custody_linked: z.object({
    representation_id: account,
    structure: z.enum(["segregated", "omnibus", "on_chain_vault"]),
    custodian_ids: z.array(account),
    by: account,
    timestamp_ms: ms,
  }),
  reserve_attested: z.object({
    representation_id: account,
    custodian_id: account,
    reserved_units: units,
    as_of_ms: ms,
    report_hash: hash,
    report_uri: z.string(),
    simulated: z.boolean(),
    source: z.string(),
    attester_key: z.string().min(1),
    seq: id,
    timestamp_ms: ms,
  }),
  reserve_policy_set: z.object({
    representation_id: account,
    policy: z.object({
      tolerance_bps: z.number().int().min(0),
      max_reserve_age_ms: ms,
      action: reserveAction,
      baseline_supply: units,
    }),
    by: account,
    timestamp_ms: ms,
  }),
  reserve_supply_read: z.object({
    representation_id: account,
    supply: units,
    timestamp_ms: ms,
  }),
  reserve_status_changed: z.object({
    representation_id: account,
    from_state: z.string(),
    to_state: reserveState,
    action: reserveAction.nullable(),
    attested_units: units,
    circulating_units: units,
    ratio_bps: z.number().int().nonnegative().nullable(),
    timestamp_ms: ms,
  }),
  mint_requested: z.object({
    id,
    representation_id: account,
    recipient: account,
    amount: units,
    reference: z.string(),
    requested_by: account,
    timestamp_ms: ms,
  }),
  mint_completed: z.object({
    id,
    representation_id: account,
    recipient: account,
    amount: units,
    timestamp_ms: ms,
  }),
  mint_failed: z.object({
    id,
    representation_id: account,
    reason: z.string(),
    timestamp_ms: ms,
  }),
  mint_cancelled: z.object({ id, by: account, timestamp_ms: ms }),
  redemption_terms_set: z.object({
    representation_id: account,
    version: id,
    terms_hash: hash,
    terms: z.object({
      min_amount: units,
      max_amount: units,
      fee_bps: z.number().int().min(0),
      window_anchor_ms: ms,
      window_length_ms: ms,
      window_period_ms: ms,
      accept_within_ms: ms,
      settlement_days: z.number().int().min(0),
    }),
    by: account,
    timestamp_ms: ms,
  }),
  redemption_requested: z.object({
    id,
    user: account,
    representation_id: account,
    issuer_id: account,
    amount: units,
    fee_bps: z.number().int().min(0),
    fee_units: units,
    terms_hash: hash,
    terms_version: id,
    payout_instruction_hash: hash,
    accept_deadline_ms: ms,
    timestamp_ms: ms,
  }),
  redemption_refused: z.object({
    reason: z.enum([
      "UNKNOWN_TOKEN",
      "INVALID_MSG",
      "PAUSED",
      "ASSET_NOT_REDEEMABLE",
      "TERMS_MISSING",
      "TERMS_CHANGED",
      "BELOW_MIN",
      "ABOVE_MAX",
      "WINDOW_CLOSED",
      "TOO_MANY_OPEN",
    ]),
    sender_id: account,
    token: account,
    amount: units,
    timestamp_ms: ms,
  }),
  redemption_accepted: z.object({
    id,
    accepted_ms: ms,
    fulfil_deadline_ms: ms,
    by: account,
    timestamp_ms: ms,
  }),
  redemption_rejected: z.object({ id, reason: z.string(), by: account, timestamp_ms: ms }),
  redemption_fulfilled: z.object({ id, evidence_hash: hash, amount: units, timestamp_ms: ms }),
  redemption_fulfil_failed: z.object({ id, timestamp_ms: ms }),
  redemption_expired: z.object({ id, miss: z.enum(["accept", "fulfil"]), timestamp_ms: ms }),
  redemption_reclaimed: z.object({ id, user: account, amount: units, timestamp_ms: ms }),
  redemption_reclaim_failed: z.object({ id, timestamp_ms: ms }),
} as const;

export type MirrorEventName = keyof typeof SCHEMAS;
export type MirrorEventData = { [K in MirrorEventName]: z.infer<(typeof SCHEMAS)[K]> };
export type MirrorEvent = {
  [K in MirrorEventName]: { name: K; data: MirrorEventData[K] };
}[MirrorEventName];

export type ParsedMirrorEvent =
  | { kind: "event"; event: MirrorEvent }
  | { kind: "invalid"; name: string; problem: string }
  | { kind: "other" };

function isMirrorEventName(name: string): name is MirrorEventName {
  return Object.hasOwn(SCHEMAS, name);
}

/** `other` for events the mirror does not interpret; `invalid` for a known event with an unexpected payload. */
export function parseMirrorEvent(event: CoreEvent): ParsedMirrorEvent {
  if (!isMirrorEventName(event.name)) return { kind: "other" };
  const parsed = SCHEMAS[event.name].safeParse(event.data);
  if (!parsed.success) {
    const problem = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(payload)"}: ${i.message}`)
      .join("; ");
    return { kind: "invalid", name: event.name, problem };
  }
  // Each schema parses exactly its own event name, so the pair is a member of `MirrorEvent`.
  return { kind: "event", event: { name: event.name, data: parsed.data } as MirrorEvent };
}
