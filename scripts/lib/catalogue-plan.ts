// Turns the catalogue data into the exact records and arguments the contract calls take. Pure
// apart from reading the dossier files for their hashes (ADR 0009).

import { ratioBetween, rationalToWire } from "@pontis/domain";
import {
  CLAIMS,
  ISSUERS,
  RELATIONSHIPS,
  REPRESENTATIONS,
  TRANSFER_POLICY,
  tokenAccount,
  unitMultiplier,
  type CatalogueRepresentation,
} from "./catalogue.ts";
import { dossierEvidence, REPO_ROOT } from "./evidence.ts";

const flags = { synthetic: true } as const;

/** Whole tokens to smallest units. */
export function smallestUnits(wholeTokens: bigint, decimals: number): bigint {
  return wholeTokens * 10n ** BigInt(decimals);
}

export function buildCatalogue(deployerId: string, root: string = REPO_ROOT) {
  const accountOf = (rep: CatalogueRepresentation) => tokenAccount(rep.id, deployerId);
  const repById = new Map(REPRESENTATIONS.map((r) => [r.id, r]));
  const issuerById = new Map(ISSUERS.map((i) => [i.id, i]));
  const claimById = new Map(CLAIMS.map((c) => [c.id, c]));
  const need = <T>(map: Map<string, T>, id: string, what: string): T => {
    const found = map.get(id);
    if (!found) throw new Error(`catalogue names unknown ${what} ${id}`);
    return found;
  };

  return {
    issuers: ISSUERS.map((issuer) => ({
      record: {
        id: issuer.id,
        name: issuer.name,
        jurisdiction: null,
        authorized_categories: [...issuer.authorizedCategories],
        // Enforced by the contract when non-empty: a token account must be one of these. An
        // issuer with no token (rejected before issuing) declares no constraint.
        controlled_accounts: REPRESENTATIONS.filter((r) => r.issuerId === issuer.id).map(accountOf),
        contact: "Pontis project team (testnet only)",
        verification_status: issuer.verification,
        ...flags,
      },
      evidence: dossierEvidence(issuer.dossier, root),
      activate: issuer.activate,
      finalStatus: issuer.finalStatus,
    })),
    claims: CLAIMS.map((claim) => ({
      asset: {
        id: claim.id,
        name: claim.name,
        category: claim.category,
        claim_description: claim.claimDescription,
        unit_definition: claim.unitDefinition,
        denomination: claim.denomination,
        economic_rights: claim.economicRights,
        legal_claim_structure: claim.legalClaimStructure,
        jurisdiction: null,
        redemption_terms: claim.redemptionTerms,
        valuation_method: claim.valuationMethod,
        eligibility_restrictions: claim.eligibilityRestrictions,
        risk_disclosures: [...claim.riskDisclosures],
        verification_status: "unverified",
        ...flags,
      },
      evidence: dossierEvidence(claim.dossier, root),
    })),
    representations: REPRESENTATIONS.map((rep) => {
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
      };
    }),
    relationships: RELATIONSHIPS.map((rel) => {
      const a = need(repById, rel.a, "representation");
      const b = need(repById, rel.b, "representation");
      return {
        pair: { representation_a_id: rel.a, representation_b_id: rel.b },
        classification: "DIRECT_EQUIVALENT",
        // Output smallest units of b per smallest unit of a; the contract recomputes it from
        // the multipliers at approval (ADR 0001).
        ratio: rationalToWire(ratioBetween(unitMultiplier(a), unitMultiplier(b))),
        scope: rel.scope,
        rationale: rel.rationale,
        approval_rationale: rel.approvalRationale,
        approve: rel.approve,
        evidence: dossierEvidence(need(claimById, rel.claimId, "claim").dossier, root),
      };
    }),
  };
}
