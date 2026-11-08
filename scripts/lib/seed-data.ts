// The MVP seed: two synthetic issuers, one synthetic claim, two NEP-141 representations and one
// DIRECT_EQUIVALENT relationship, exactly as described in docs/asset-dossiers (ADR 0001, 0009).
// Evidence hashes are computed from the dossier files, so editing a dossier changes the hash.

import { type Rational, ratioBetween, rational, rationalToWire } from "@pontis/domain";
import { dossierEvidence, REPO_ROOT } from "./evidence.ts";

const flags = { synthetic: true, verification_status: "unverified" } as const;

export const MULTIPLIER_A: Rational = rational(1n, 10n ** 6n);
export const MULTIPLIER_B: Rational = rational(1n, 10n ** 9n);
/** Approved ratio A to B in smallest units: 1000 / 1 (1 A = 10 B). */
export const RATIO_A_TO_B: Rational = ratioBetween(MULTIPLIER_A, MULTIPLIER_B);

const none = "None";

export function buildSeed(ids: { tokenA: string; tokenB: string }, root: string = REPO_ROOT) {
  const issuer = (id: string, name: string) => ({
    id,
    name,
    jurisdiction: null,
    authorized_categories: ["synthetic test claims"],
    controlled_accounts: [] as string[],
    contact: "Pontis project team (testnet only)",
    ...flags,
  });
  const representation = (
    id: string,
    issuerId: string,
    accountId: string,
    symbol: string,
    decimals: number,
    multiplier: Rational,
  ) => ({
    id,
    canonical_asset_id: "syn-gold-oz",
    issuer_id: issuerId,
    account_id: accountId,
    name: `SYNTHETIC TEST Gold ${symbol.slice(-1)}`,
    symbol,
    decimals,
    unit_multiplier: rationalToWire(multiplier),
    admin_capabilities: ["owner mint", "owner burn", "owner pause", "testnet faucet_mint"],
    custody_description: none,
    redemption_mechanism: none,
    transfer_policy_summary: "Testnet allowlist in pontis-core",
    bridge_status: "none",
    ...flags,
  });
  return {
    issuers: [
      {
        ...issuer("synthetic-issuer-a", "Synthetic Issuer A"),
        evidence: dossierEvidence("TGOLD-A", root),
      },
      {
        ...issuer("synthetic-issuer-b", "Synthetic Issuer B"),
        evidence: dossierEvidence("TGOLD-B", root),
      },
    ],
    canonicalAsset: {
      asset: {
        id: "syn-gold-oz",
        name: "Synthetic Gold, one troy ounce",
        category: "Synthetic commodity claim (test only)",
        claim_description: "A fictional claim to one troy ounce of fictional allocated gold.",
        unit_definition: "1 canonical unit = 1 fictional troy ounce",
        denomination: null,
        economic_rights: "None. The claim confers no economic rights.",
        legal_claim_structure: "None. There is no legal entity, contract or trust behind it.",
        jurisdiction: null,
        redemption_terms: "None. The claim cannot be redeemed.",
        valuation_method: null,
        eligibility_restrictions: "Testnet allowlist only; not a regulatory eligibility regime.",
        risk_disclosures: [
          "Not backed by any asset.",
          "Parity conversion says nothing about price.",
        ],
        ...flags,
      },
      evidence: dossierEvidence("SYN-GOLD-OZ", root),
    },
    representations: [
      {
        representation: representation(
          "tgold-a",
          "synthetic-issuer-a",
          ids.tokenA,
          "TGOLD-A",
          6,
          MULTIPLIER_A,
        ),
        evidence: dossierEvidence("TGOLD-A", root),
      },
      {
        representation: representation(
          "tgold-b",
          "synthetic-issuer-b",
          ids.tokenB,
          "TGOLD-B",
          8,
          MULTIPLIER_B,
        ),
        evidence: dossierEvidence("TGOLD-B", root),
      },
    ],
    compatibility: {
      representation_a_id: "tgold-a",
      representation_b_id: "tgold-b",
      classification: "DIRECT_EQUIVALENT",
      ratio: rationalToWire(RATIO_A_TO_B),
      scope: "Parity conversion of synthetic test tokens through the controlled test vault only.",
      rationale:
        "Both are test representations of SYN-GOLD-OZ; ratio derived from unit multipliers (1 A = 10 B).",
      approval_rationale: "Approved for the MVP demonstration; self-reviewed by the project team.",
      evidence: dossierEvidence("SYN-GOLD-OZ", root),
    },
  };
}
