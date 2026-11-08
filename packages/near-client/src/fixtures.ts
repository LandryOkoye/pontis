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
