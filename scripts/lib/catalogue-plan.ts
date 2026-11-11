// Turns the catalogue data into the exact records and arguments the contract calls take. Pure
// apart from reading the dossier files for their hashes (ADR 0009).

import { ratioBetween, rationalToWire, type RationalWire } from "@pontis/domain";
import {
  TRANSFER_POLICY,
  tokenAccount,
  unitMultiplier,
  type CatalogueRepresentation,
  type SeededClassification,
} from "./catalogue.ts";
import { GUARD_PRESETS } from "./catalogue-guards.ts";
import { BASE_CATALOGUE, type CatalogueData } from "./catalogue-tiers.ts";
import { dossierEvidence, REPO_ROOT, type NewEvidence } from "./evidence.ts";
import type { RouteGuardArgs } from "./guard-types.ts";

/** One relationship of the plan, in the arguments the contract calls take. */
export interface PlannedRelationship {
  pair: { representation_a_id: string; representation_b_id: string };
  classification: SeededClassification;
  /** Output smallest units of b per smallest unit of a. */
  ratio: RationalWire;
  scope: string;
  rationale: string;
  approval_rationale: string;
  approve: boolean;
  /** Proposed with evidence, then rejected. */
  reject: boolean;
  /** Set after approval; none for a pair that is not approved. */
  guard: RouteGuardArgs | null;
  evidence: NewEvidence;
}

const flags = { synthetic: true } as const;

/** Whole tokens to smallest units. */
export function smallestUnits(wholeTokens: bigint, decimals: number): bigint {
  return wholeTokens * 10n ** BigInt(decimals);
}

/**
 * The plan of `data`: the phase 1 catalogue unless a tier's data (catalogue-tiers.ts) is given.
 */
export function buildCatalogue(
  deployerId: string,
  root: string = REPO_ROOT,
  data: CatalogueData = BASE_CATALOGUE,
) {
  const accountOf = (rep: CatalogueRepresentation) => tokenAccount(rep.id, deployerId);
  const repById = new Map(data.representations.map((r) => [r.id, r]));
  const issuerById = new Map(data.issuers.map((i) => [i.id, i]));
  const claimById = new Map(data.claims.map((c) => [c.id, c]));
  const need = <T>(map: Map<string, T>, id: string, what: string): T => {
    const found = map.get(id);
    if (!found) throw new Error(`catalogue names unknown ${what} ${id}`);
    return found;
  };

  return {
    issuers: data.issuers.map((issuer) => ({
      record: {
        id: issuer.id,
        name: issuer.name,
        jurisdiction: issuer.jurisdiction ?? null,
        authorized_categories: [...issuer.authorizedCategories],
        // Enforced by the contract when non-empty: a token account must be one of these. An
        // issuer with no token (rejected before issuing) declares no constraint.
        controlled_accounts: data.representations
          .filter((r) => r.issuerId === issuer.id)
          .map(accountOf),
        contact: issuer.contact ?? "Pontis project team (testnet only)",
        verification_status: issuer.verification,
        ...flags,
      },
      evidence: dossierEvidence(issuer.dossier, root),
      activate: issuer.activate,
      finalStatus: issuer.finalStatus,
    })),
    claims: data.claims.map((claim) => ({
      asset: {
        id: claim.id,
        name: claim.name,
        category: claim.category,
        claim_description: claim.claimDescription,
        unit_definition: claim.unitDefinition,
        denomination: claim.denomination,
        economic_rights: claim.economicRights,
        legal_claim_structure: claim.legalClaimStructure,
        jurisdiction: claim.jurisdiction ?? null,
        redemption_terms: claim.redemptionTerms,
        valuation_method: claim.valuationMethod,
        eligibility_restrictions: claim.eligibilityRestrictions,
        risk_disclosures: [...claim.riskDisclosures],
        verification_status: "unverified",
        ...flags,
      },
      evidence: dossierEvidence(claim.dossier, root),
    })),
    representations: data.representations.map((rep) => {
      const issuer = need(issuerById, rep.issuerId, "issuer");
      need(claimById, rep.claimId, "claim");
      return {
        representation: {
          id: rep.id,
          canonical_asset_id: rep.claimId,
          issuer_id: rep.issuerId,
          account_id: accountOf(rep),
          name: rep.name,
          symbol: rep.symbol,
          decimals: rep.decimals,
          unit_multiplier: rationalToWire(unitMultiplier(rep)),
          admin_capabilities: [...rep.adminCapabilities],
          custody_description: rep.custodyDescription,
          redemption_mechanism: rep.redemptionMechanism,
          transfer_policy_summary: TRANSFER_POLICY,
          bridge_status: "none",
          verification_status: issuer.verification,
          ...flags,
        },
        // The issuer's dossier lists every token it issued, so it is the representation's evidence.
        evidence: dossierEvidence(issuer.dossier, root),
        // The contract activates a representation only while its issuer is active.
        activate: issuer.activate,
        startingSupply: smallestUnits(rep.startingSupply, rep.decimals),
        vaultInventory: smallestUnits(rep.vaultInventory, rep.decimals),
        faucet: rep.faucet,
        finalStatus: rep.finalStatus ?? "active",
      };
    }),
    relationships: data.relationships.map((rel): PlannedRelationship => {
      const a = need(repById, rel.a, "representation");
      const b = need(repById, rel.b, "representation");
      return {
        pair: { representation_a_id: rel.a, representation_b_id: rel.b },
        classification: rel.classification ?? "DIRECT_EQUIVALENT",
        // Output smallest units of b per smallest unit of a; the contract recomputes it from
        // the multipliers at approval (ADR 0001).
        ratio: rationalToWire(ratioBetween(unitMultiplier(a), unitMultiplier(b))),
        scope: rel.scope,
        rationale: rel.rationale,
        approval_rationale: rel.approvalRationale,
        approve: rel.approve,
        reject: rel.review === "reject",
        guard: rel.guard ? GUARD_PRESETS[rel.guard] : null,
        evidence: dossierEvidence(need(claimById, rel.claimId, "claim").dossier, root),
      };
    }),
  };
}
