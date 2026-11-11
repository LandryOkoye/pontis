// Types and builders for the rich demo catalogue (ADR 0019 section 3): the issuers, claims,
// representations and relationships added on top of the phase 1 catalogue in catalogue.ts. Every
// name, domain, ticker and story is invented; a real company, fund, token or regulator-issued
// product is never named or imitated. Jurisdictions and regulator categories are real places and
// categories, used as plain facts about where a fictional issuer would sit.
//
// Each entry names the smallest tier that includes it: `demo` entries are in both the `demo` and
// the `full` tier, `full` entries only in `full` (scripts/lib/catalogue-tiers.ts).

import { rational, type Rational } from "@pontis/domain";
import {
  type CatalogueClaim,
  type CatalogueIssuer,
  type CatalogueRelationship,
  type CatalogueRepresentation,
  type RecordStatus,
  type Verification,
} from "./catalogue.ts";

export type RichTier = "demo" | "full";

export interface RichIssuer extends CatalogueIssuer {
  tier: RichTier;
  jurisdiction: string;
  /** What kind of firm it plays, and the real regulator category such a firm would sit under. */
  kind: string;
  /** The issuer's story for its dossier: who it pretends to be and why it is in this state. */
  story: string;
}

export interface RichClaim extends CatalogueClaim {
  tier: RichTier;
  /** Instrument kind and lifecycle for the dossier (NAV strike, maturity, unique, and so on). */
  lifecycle: string;
  story: string;
  /** A corporate action recorded in the dossier only: nothing on chain implements it. */
  corporateAction?: string;
}

export interface RichRepresentation extends CatalogueRepresentation {
  tier: RichTier;
}

export interface RichRelationship extends CatalogueRelationship {
  tier: RichTier;
}

const NO_RIGHTS = "None. The claim confers no economic rights.";
const NO_LEGAL = "None. There is no legal entity, contract or trust behind it.";
const NO_REDEMPTION = "None. The claim cannot be redeemed.";
const ALLOWLIST_ONLY = "Testnet allowlist only; not a regulatory eligibility regime.";
const OWNER_CAPABILITIES = ["owner mint", "owner burn", "owner pause"] as const;
const WITH_FAUCET = [...OWNER_CAPABILITIES, "testnet faucet_mint"] as const;

export function richIssuer(
  i: Pick<RichIssuer, "id" | "name" | "tier" | "jurisdiction" | "kind" | "story"> & {
    categories: readonly string[];
    verification: Verification;
    /** Status after seeding; `restricted` with `activate` set is an issuer suspended after it began. */
    finalStatus: RecordStatus;
    /** Whether the seed activates it first; false for an applicant that stays `restricted`. */
    activate: boolean;
  },
): RichIssuer {
  return {
    id: i.id,
    name: `${i.name} (simulated)`,
    authorizedCategories: i.categories,
    verification: i.verification,
    activate: i.activate,
    finalStatus: i.finalStatus,
    dossier: i.id.toUpperCase(),
    tier: i.tier,
    jurisdiction: i.jurisdiction,
    contact: `Simulated desk contact: desk@${i.id}.example (a reserved example domain; no mailbox exists)`,
    kind: i.kind,
    story: i.story,
  };
}

export function richClaim(c: {
  id: string;
  tier: RichTier;
  name: string;
  category: string;
  /** What the fictional claim is a claim to, completing "A fictional claim to ...". */
  what: string;
  /** Completes "1 canonical unit = ...". */
  unit: string;
  denomination?: string;
  valuation: string;
  redemption?: string;
  rights?: string;
  legal?: string;
  risks: readonly string[];
  lifecycle: string;
  story: string;
  corporateAction?: string;
  /** A real place as a plain fact about where the fictional instrument would sit. */
  jurisdiction?: string;
}): RichClaim {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    claimDescription: `A fictional claim to ${c.what}.`,
    unitDefinition: `1 canonical unit = ${c.unit}`,
    denomination: c.denomination ?? "USD, as a simulated price only",
    economicRights: c.rights ?? NO_RIGHTS,
    legalClaimStructure: c.legal ?? NO_LEGAL,
    redemptionTerms: c.redemption ?? NO_REDEMPTION,
    valuationMethod: c.valuation,
    eligibilityRestrictions: ALLOWLIST_ONLY,
    riskDisclosures: ["Not backed by any asset; prices and supply are simulated.", ...c.risks],
    dossier: c.id.toUpperCase(),
    tier: c.tier,
    lifecycle: c.lifecycle,
    story: c.story,
    ...(c.corporateAction ? { corporateAction: c.corporateAction } : {}),
    ...(c.jurisdiction ? { jurisdiction: c.jurisdiction } : {}),
  };
}

export function richRepresentation(r: {
  id: string;
  claim: string;
  issuer: string;
  tier: RichTier;
  /** Appended to "SYNTHETIC TEST ". */
  name: string;
  symbol: string;
  decimals: number;
  /** Canonical units in one whole token; one when absent. */
  unitsPerToken?: Rational;
  /** Whole tokens the owner mints to itself; a unique asset ignores it (exactly one). */
  supply?: number;
  /** Whole tokens funded into the vault; only for a token with an approved relationship. */
  vault?: number;
  bridgeable?: boolean;
  /** One indivisible record: 0 decimals, one token, no faucet, nothing to convert against. */
  unique?: boolean;
  custody?: string;
  redemption?: string;
  finalStatus?: "active" | "deprecated";
  note?: string;
}): RichRepresentation {
  const unique = r.unique === true;
  return {
    id: r.id,
    claimId: r.claim,
    issuerId: r.issuer,
    name: `SYNTHETIC TEST ${r.name}`,
    symbol: r.symbol,
    decimals: unique ? 0 : r.decimals,
    unitsPerToken: r.unitsPerToken ?? rational(1n),
    adminCapabilities: unique ? OWNER_CAPABILITIES : WITH_FAUCET,
    custodyDescription: r.custody ?? "None",
    redemptionMechanism: r.redemption ?? "None",
    startingSupply: BigInt(unique ? 1 : (r.supply ?? 1_000_000)),
    vaultInventory: BigInt(r.vault ?? 0),
    faucet: !unique,
    convertible: !unique,
    bridgeable: r.bridgeable ?? false,
    ...(r.finalStatus ? { finalStatus: r.finalStatus } : {}),
    tier: r.tier,
    ...(r.note ? { note: r.note } : {}),
  };
}

export function richRelationship(
  r: Pick<RichRelationship, "a" | "b" | "claimId" | "tier"> & {
    scope?: string;
    rationale: string;
    /** Why it was approved, or what happened instead. */
    outcome: string;
    approve: boolean;
    classification?: RichRelationship["classification"];
    review?: RichRelationship["review"];
    guard?: RichRelationship["guard"];
  },
): RichRelationship {
  const [a, b] = r.a < r.b ? [r.a, r.b] : [r.b, r.a];
  return {
    a,
    b,
    claimId: r.claimId,
    tier: r.tier,
    scope:
      r.scope ??
      "Parity conversion of synthetic test tokens through the controlled test vault only.",
    rationale: r.rationale,
    approvalRationale: r.outcome,
    approve: r.approve,
    ...(r.classification ? { classification: r.classification } : {}),
    ...(r.review ? { review: r.review } : {}),
    ...(r.guard ? { guard: r.guard } : {}),
  };
}
