// Event payloads built from the shapes ADR 0020 fixes. Times are ms since the epoch.

export const T0 = Date.parse("2026-11-11T12:00:00Z");
export const HASH_A = "ab".repeat(32);
export const HASH_B = "cd".repeat(32);
export const HASH_C = "ef".repeat(32);
export const DAY = 86_400_000;

type Event = [string, Record<string, unknown>];
const ev = (name: string, data: Record<string, unknown>): Event => [name, data];

export const custodianRegistered = (over: Record<string, unknown> = {}) =>
  ev("custodian_registered", {
    id: "vault-co-sim",
    attester_key: "ed25519:custodian-key",
    by: "reg.testnet",
    timestamp_ms: T0,
    ...over,
  });

export const custodianStatusChanged = (over: Record<string, unknown> = {}) =>
  ev("custodian_status_changed", {
    id: "vault-co-sim",
    from: "active",
    to: "suspended",
    by: "reg.testnet",
    timestamp_ms: T0 + 1_000,
    ...over,
  });

export const custodianKeySet = (over: Record<string, unknown> = {}) =>
  ev("custodian_key_set", {
    id: "vault-co-sim",
    attester_key: "ed25519:rotated-key",
    by: "reg.testnet",
    timestamp_ms: T0 + 2_000,
    ...over,
  });

export const custodyLinked = (over: Record<string, unknown> = {}) =>
  ev("custody_linked", {
    representation_id: "a",
    structure: "segregated",
    custodian_ids: ["vault-co-sim"],
    by: "reg.testnet",
    timestamp_ms: T0 + 3_000,
    ...over,
  });

export const reserveAttested = (over: Record<string, unknown> = {}) =>
  ev("reserve_attested", {
    representation_id: "a",
    custodian_id: "vault-co-sim",
    reserved_units: "1000000000000",
    as_of_ms: T0 + 4_000,
    report_hash: HASH_A,
    report_uri: "sim://reserves/a/2026-11",
    simulated: true,
    source: "simulated_custodian",
    attester_key: "ed25519:custodian-key",
    seq: 0,
    timestamp_ms: T0 + 5_000,
    ...over,
  });

export const reservePolicySet = (over: Record<string, unknown> = {}) =>
  ev("reserve_policy_set", {
    representation_id: "a",
    policy: {
      tolerance_bps: 0,
      max_reserve_age_ms: DAY,
      action: "restrict_conversions",
      baseline_supply: "0",
    },
    by: "owner.testnet",
    timestamp_ms: T0 + 6_000,
    ...over,
  });

export const reserveSupplyRead = (over: Record<string, unknown> = {}) =>
  ev("reserve_supply_read", {
    representation_id: "a",
    supply: "900000000000",
    timestamp_ms: T0 + 7_000,
    ...over,
  });

export const reserveStatusChanged = (over: Record<string, unknown> = {}) =>
  ev("reserve_status_changed", {
    representation_id: "a",
    from_state: "no_attestation",
    to_state: "ok",
    action: "restrict_conversions",
    attested_units: "1000000000000",
    circulating_units: "900000000000",
    ratio_bps: 11_111,
    timestamp_ms: T0 + 8_000,
    ...over,
  });

export const signerKeyAdded = (over: Record<string, unknown> = {}) =>
  ev("signer_key_added", {
    role: "reserve_attester",
    account_id: "att.testnet",
    public_key: "ed25519:custodian-key",
    scopes: ["reserves"],
    by: "owner.testnet",
    timestamp_ms: T0,
    ...over,
  });

export const signerKeyRemoved = (over: Record<string, unknown> = {}) =>
  ev("signer_key_removed", {
    role: "reserve_attester",
    account_id: "att.testnet",
    public_key: "ed25519:custodian-key",
    by: "owner.testnet",
    timestamp_ms: T0 + 9_000,
    ...over,
  });

export const mintRequested = (over: Record<string, unknown> = {}) =>
  ev("mint_requested", {
    id: 1,
    representation_id: "a",
    recipient: "alice.testnet",
    amount: "5000000",
    reference: "sub-0001",
    requested_by: "issuer-bo.testnet",
    timestamp_ms: T0 + 10_000,
    ...over,
  });

export const redemptionTermsSet = (over: Record<string, unknown> = {}) =>
  ev("redemption_terms_set", {
    representation_id: "a",
    version: 1,
    terms_hash: HASH_A,
    terms: {
      min_amount: "1000000",
      max_amount: "0",
      fee_bps: 25,
      window_anchor_ms: 0,
      window_length_ms: 0,
      window_period_ms: 0,
      accept_within_ms: DAY,
      settlement_days: 3,
    },
    by: "reg.testnet",
    timestamp_ms: T0,
    ...over,
  });

export const redemptionRequested = (over: Record<string, unknown> = {}) =>
  ev("redemption_requested", {
    id: 1,
    user: "alice.testnet",
    representation_id: "a",
    issuer_id: "meridian-sim",
    amount: "5000000",
    fee_bps: 25,
    fee_units: "12500",
    terms_hash: HASH_A,
    terms_version: 1,
    payout_instruction_hash: HASH_B,
    accept_deadline_ms: T0 + DAY,
    timestamp_ms: T0,
    ...over,
  });

export const redemptionAccepted = (over: Record<string, unknown> = {}) =>
  ev("redemption_accepted", {
    id: 1,
    accepted_ms: T0 + 60_000,
    fulfil_deadline_ms: T0 + 60_000 + 3 * DAY,
    by: "issuer-bo.testnet",
    timestamp_ms: T0 + 60_000,
    ...over,
  });

export const redemptionRejected = (over: Record<string, unknown> = {}) =>
  ev("redemption_rejected", {
    id: 1,
    reason: "payout_details_unreadable",
    by: "issuer-bo.testnet",
    timestamp_ms: T0 + 60_000,
    ...over,
  });

export const redemptionFulfilled = (over: Record<string, unknown> = {}) =>
  ev("redemption_fulfilled", {
    id: 1,
    evidence_hash: HASH_C,
    amount: "5000000",
    circulating_units: "895000000000",
    timestamp_ms: T0 + 120_000,
    ...over,
  });

export const redemptionExpired = (over: Record<string, unknown> = {}) =>
  ev("redemption_expired", {
    id: 1,
    miss: "accept",
    timestamp_ms: T0 + DAY + 1,
    ...over,
  });

export const redemptionReclaimed = (over: Record<string, unknown> = {}) =>
  ev("redemption_reclaimed", {
    id: 1,
    user: "alice.testnet",
    amount: "5000000",
    timestamp_ms: T0 + DAY + 2,
    ...over,
  });
