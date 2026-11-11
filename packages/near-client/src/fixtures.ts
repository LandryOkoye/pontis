// The MVP seed as pontis-core returns it (see docs/asset-dossiers and scripts/lib/seed-data.ts).
// `fixtureSource()` is a `RegistrySource` for tests that need a chain without a network.

import type { RegistrySource } from "./core.ts";
import type {
  ChainCanonicalAsset,
  ChainCompatibility,
  ChainEvidence,
  ChainIssuer,
  ChainPolicy,
  ChainRepresentation,
} from "./schemas.ts";
import type {
  ChainCustodian,
  ChainCustodyLink,
  ChainEscrowLedger,
  ChainIssuerReliability,
  ChainRedemption,
  ChainRedemptionTerms,
  ChainReserveRecord,
  ChainReserveStatus,
} from "./custody-schemas.ts";
import type { ExpectedConversionTx, TxFacts } from "./transaction-check.ts";

const T0 = 1_794_074_400_000; // 2026-11-07T17:20:00Z
const OWNER = "owner.pontis.testnet";
const flags = { synthetic: true, verification_status: "unverified", status: "active" } as const;

const evidence = (dossier: string): ChainEvidence => ({
  uri: `docs/asset-dossiers/${dossier}.md`,
  sha256: "a".repeat(64),
  provenance: "issuer_provided",
  description: "Synthetic test dossier, self-attested by the project.",
  added_by: OWNER,
  timestamp_ms: T0,
});

const issuer = (id: string, name: string, dossier: string): ChainIssuer => ({
  id,
  name,
  jurisdiction: null,
  authorized_categories: ["synthetic test claims"],
  controlled_accounts: [],
  contact: "Pontis project team (testnet only)",
  evidence: [evidence(dossier)],
  registered_by: OWNER,
  registered_at_ms: T0,
  last_reviewed_ms: T0 + 1000,
  ...flags,
});

export const issuers: ChainIssuer[] = [
  issuer("synthetic-issuer-a", "Synthetic Issuer A", "TGOLD-A"),
  issuer("synthetic-issuer-b", "Synthetic Issuer B", "TGOLD-B"),
];

export const canonicalAssets: ChainCanonicalAsset[] = [
  {
    id: "syn-gold-oz",
    name: "Synthetic Gold, one troy ounce",
    category: "Synthetic commodity claim (test only)",
    claim_description: "A fictional claim to one troy ounce of fictional allocated gold.",
    unit_definition: "1 canonical unit = 1 fictional troy ounce",
    denomination: null,
    economic_rights: "None.",
    legal_claim_structure: "None.",
    jurisdiction: null,
    redemption_terms: "None.",
    valuation_method: null,
    eligibility_restrictions: "Testnet allowlist only.",
    risk_disclosures: ["Not backed by any asset."],
    evidence: [evidence("SYN-GOLD-OZ")],
    registered_by: OWNER,
    registered_at_ms: T0,
    last_reviewed_ms: T0 + 1000,
    ...flags,
  },
];

const representation = (
  id: string,
  issuerId: string,
  symbol: string,
  decimals: number,
  den: string,
): ChainRepresentation => ({
  id,
  canonical_asset_id: "syn-gold-oz",
  issuer_id: issuerId,
  account_id: `${id}.pontis.testnet`,
  name: `SYNTHETIC TEST Gold ${symbol.slice(-1)}`,
  symbol,
  decimals,
  unit_multiplier: { num: "1", den },
  admin_capabilities: ["owner mint", "owner pause"],
  custody_description: "None",
  redemption_mechanism: "None",
  transfer_policy_summary: "Testnet allowlist",
  bridge_status: "none",
  evidence: [evidence(symbol)],
  registered_by: OWNER,
  registered_at_ms: T0,
  last_reviewed_ms: T0 + 1000,
  ...flags,
});

export const representations: ChainRepresentation[] = [
  representation("tgold-a", "synthetic-issuer-a", "TGOLD-A", 6, "1000000"),
  representation("tgold-b", "synthetic-issuer-b", "TGOLD-B", 8, "1000000000"),
];

const ratio = { num: "1000", den: "1" };
const step = (
  version: number,
  action: "proposed" | "approved",
  status: "proposed" | "approved",
) => ({
  version,
  action,
  classification: "DIRECT_EQUIVALENT" as const,
  status,
  ratio,
  scope: "Parity conversion.",
  rationale: action === "proposed" ? "Test representations of one claim." : "Reviewed.",
  actor: OWNER,
  timestamp_ms: T0 + version * 1000,
});

export const compatibilities: ChainCompatibility[] = [
  {
    id: "tgold-a:tgold-b",
    representation_a_id: "tgold-a",
    representation_b_id: "tgold-b",
    classification: "DIRECT_EQUIVALENT",
    ratio,
    scope: "Parity conversion.",
    rationale: "Reviewed.",
    status: "approved",
    version: 2,
    proposed_by: OWNER,
    approved_by: OWNER,
    evidence: [evidence("SYN-GOLD-OZ")],
    history: [step(1, "proposed", "proposed"), step(2, "approved", "approved")],
    updated_at_ms: T0 + 2000,
  },
];

export const policies: ChainPolicy[] = representations.map((r) => ({
  representation_id: r.id,
  allowlist_required: true,
  policy_version: 1,
}));

export const inventories: Record<string, string> = {
  "tgold-a": "1000000000",
  "tgold-b": "1000000000000",
};

export function fixtureSource(overrides: Partial<RegistrySource> = {}): RegistrySource {
  return {
    blockHeight: async () => 200_000_000,
    listIssuers: async () => issuers,
    listCanonicalAssets: async () => canonicalAssets,
    listRepresentations: async () => representations,
    listCompatibilities: async () => compatibilities,
    getPolicy: async (id) => policies.find((p) => p.representation_id === id) ?? null,
    getInventory: async (id) => inventories[id] ?? "0",
    ...overrides,
  };
}

/** Facts of the transaction `expected` describes, as the chain would report it; override to break one. */
export function conversionTxFacts(
  expected: ExpectedConversionTx,
  over: Partial<TxFacts> = {},
): TxFacts {
  return {
    signerId: expected.signerId,
    receiverId: expected.tokenIn,
    actions: [
      {
        kind: "FunctionCall",
        methodName: "ft_transfer_call",
        args: {
          receiver_id: expected.coreId,
          amount: expected.amountIn,
          msg: JSON.stringify({
            quote: { user: expected.signerId, nonce: expected.nonce },
            signature: "c2ln",
          }),
        },
      },
    ],
    receiptIds: ["receipt-a", ...expected.settlementReceiptIds],
    ...over,
  };
}

// Custody, reserves and redemption as the views return them (ADR 0020). Every figure is the
// simulated custodian's and says so; nothing here is custodied, backed or audited.

const T1 = T0 + 60_000;

export const fixtureCustodian: ChainCustodian = {
  id: "vault-co-sim",
  name: "Meridian Vault Co (SYNTHETIC)",
  jurisdiction: "CH",
  attester_key: "ed25519:6E8bAu1MUKRDM9dvKGbgYxEFJt4sr4Z5k1QYtUwrBXRp",
  status: "active",
  synthetic: true,
  verification_status: "unverified",
  evidence: [evidence("custodian-vault-co-sim")],
  registered_by: "registrar.pontis.testnet",
  registered_at_ms: T0,
};

export const fixtureCustodyLink: ChainCustodyLink = {
  representation_id: "tgold-a",
  structure: "segregated",
  custodian_ids: ["vault-co-sim"],
  linked_by: "registrar.pontis.testnet",
  linked_at_ms: T0,
};

export const fixtureReserveRecord: ChainReserveRecord = {
  seq: 0,
  custodian_id: "vault-co-sim",
  reserved_units: "1000000000000",
  as_of_ms: T1,
  submitted_ms: T1 + 2_000,
  report_hash: "b".repeat(64),
  report_uri: "sim://reserves/tgold-a/2026-11",
  simulated: true,
  source: "simulated_custodian",
  attester_key: fixtureCustodian.attester_key,
};

export const fixtureReserveStatus: ChainReserveStatus = {
  monitored: true,
  state: "ok",
  action: "restrict_conversions",
  tolerance_bps: 0,
  max_reserve_age_ms: 86_400_000,
  attested_units: "1000000000000",
  limit_units: "1000000000000",
  circulating_units: "800000000000",
  headroom_units: "200000000000",
  ratio_bps: 12_500,
  oldest_as_of_ms: T1,
  age_ms: 30_000,
  supply_read_ms: T1,
  restricts_conversions: false,
  mint_paused: false,
  simulated: true,
  sources: ["simulated_custodian"],
};

export const fixtureRedemptionTerms: ChainRedemptionTerms = {
  terms: {
    min_amount: "1000000",
    max_amount: "0",
    fee_bps: 25,
    window_anchor_ms: 0,
    window_length_ms: 0,
    window_period_ms: 0,
    accept_within_ms: 86_400_000,
    settlement_days: 3,
  },
  version: 2,
  terms_hash: "c".repeat(64),
  set_by: "registrar.pontis.testnet",
  set_ms: T0,
};

export const fixtureRedemption: ChainRedemption = {
  id: 1,
  user: "alice.testnet",
  representation_id: "tgold-a",
  issuer_id: "synthetic-issuer-a",
  amount: "5000000",
  fee_bps: 25,
  fee_units: "12500",
  net_units: "4987500",
  terms_hash: fixtureRedemptionTerms.terms_hash,
  terms_version: 2,
  payout_instruction_hash: "d".repeat(64),
  status: "accepted",
  created_ms: T1,
  accept_deadline_ms: T1 + 86_400_000,
  accepted_ms: T1 + 600_000,
  fulfil_deadline_ms: T1 + 600_000 + 3 * 86_400_000,
  resolved_ms: null,
  fulfilment_evidence_hash: null,
  reject_reason: null,
  miss: null,
  settlement_days: 3,
};

export const fixtureEscrowLedger: ChainEscrowLedger = {
  escrowed_in: "5000000",
  burned: "0",
  returned: "0",
  held: "5000000",
  open_amount: "5000000",
};

export const fixtureIssuerReliability: ChainIssuerReliability = {
  issuer_id: "synthetic-issuer-a",
  requested: 4,
  accepted: 3,
  fulfilled: 2,
  rejected: 1,
  expired: 0,
  accept_misses: 0,
  fulfil_misses: 0,
  reclaimed: 0,
  accept_latency_ms_total: "1800000",
  settle_latency_ms_total: "259200000",
  last_miss_ms: null,
  simulated: true,
};
