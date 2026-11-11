// The demo seed catalogue as plain typed data: issuers, canonical assets, representations and
// relationships. No chain, file or database access happens here so demo tooling can import it.
// Everything is fiction. Trust states use only what the contract and ADR 0009 allow today:
// `unverified` and `issuer_attested` (the registrar recorded that the issuer supplied evidence).
// Nothing is `third_party_attested` (no third party exists) or `independently_verified` (the
// contract refuses it).

import { type Rational, rational } from "@pontis/domain";

export type Verification = "unverified" | "issuer_attested";
export type RecordStatus = "active" | "restricted" | "deprecated" | "rejected";
/** Only these classifications are proposed by the seed; INCOMPATIBLE and SUSPENDED are not. */
export type SeededClassification = "DIRECT_EQUIVALENT" | "ECONOMICALLY_SIMILAR";
/** Route-guard presets the seed can set on an approved pair (scripts/lib/catalogue-guards.ts). */
export type GuardPreset = "fund" | "stable" | "equity" | "commodity" | "illiquid";

export const CATEGORY = {
  equity: "Synthetic tokenized equity (test only)",
  fund: "Synthetic Treasury fund (test only)",
  property: "Synthetic real-estate property record (test only)",
  credit: "Synthetic private-credit note (test only)",
  dollar: "Synthetic dollar-pegged quote asset (test only)",
} as const;

export interface CatalogueIssuer {
  id: string;
  name: string;
  authorizedCategories: readonly string[];
  verification: Verification;
  /** Whether the seed activates it. The contract only activates a representation of an active issuer. */
  activate: boolean;
  /** The status after seeding: `deprecated` and `rejected` are reached by moving it afterwards. */
  finalStatus: RecordStatus;
  /** Dossier file (without `.md`) in docs/asset-dossiers; its hash is the issuer's evidence. */
  dossier: string;
  /** A real place as a plain fact; the issuer itself is fictional. Absent (null on chain) in phase 1. */
  jurisdiction?: string;
  /** The on-chain contact text; the phase 1 project-team text when absent. */
  contact?: string;
}

export interface CatalogueClaim {
  id: string;
  name: string;
  category: string;
  claimDescription: string;
  unitDefinition: string;
  denomination: string | null;
  economicRights: string;
  legalClaimStructure: string;
  redemptionTerms: string;
  valuationMethod: string | null;
  eligibilityRestrictions: string;
  riskDisclosures: readonly string[];
  dossier: string;
  /** A real place as a plain fact; the claim itself is fictional. Absent (null on chain) in phase 1. */
  jurisdiction?: string;
}

export interface CatalogueRepresentation {
  id: string;
  claimId: string;
  issuerId: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Canonical units in one whole token; the contract's multiplier is this over 10^decimals. */
  unitsPerToken: Rational;
  adminCapabilities: readonly string[];
  custodyDescription: string;
  redemptionMechanism: string;
  /** Whole tokens the owner mints to itself. */
  startingSupply: bigint;
  /** Whole tokens funded into the vault; 0 unless the token has an approved relationship. */
  vaultInventory: bigint;
  /** Whether the token's testnet faucet stays enabled. */
  faucet: boolean;
  /** Off-chain profile hints (asset_profiles), not contract data. */
  convertible: boolean;
  bridgeable: boolean;
  /** Status of the record after seeding when it is not simply `active` (a delisted wrapper). */
  finalStatus?: "active" | "deprecated";
  /** Why the record is in an unusual state, for the dossier and the profile. */
  note?: string;
}

export interface CatalogueRelationship {
  /** Both ids sorted ascending, as the contract keys them. */
  a: string;
  b: string;
  claimId: string;
  scope: string;
  rationale: string;
  approvalRationale: string;
  /** False when the contract cannot approve it (a representation that can never be active). */
  approve: boolean;
  /** `DIRECT_EQUIVALENT` when absent. Only an approved DIRECT_EQUIVALENT pair converts. */
  classification?: SeededClassification;
  /** `reject`: proposed with evidence, then rejected by the compat approver. Needs `approve: false`. */
  review?: "reject";
  /** Guard set on the pair after it is approved (ADR 0016); none when absent. */
  guard?: GuardPreset;
}

const NONE = "None";
const OWNER_CAPABILITIES = ["owner mint", "owner burn", "owner pause"] as const;
const WITH_FAUCET = [...OWNER_CAPABILITIES, "testnet faucet_mint"] as const;
/** The transfer policy every catalogue representation states (ADR 0005). */
export const TRANSFER_POLICY = "Testnet allowlist in pontis-core";
const tokens = (n: number) => BigInt(n);

export const ISSUERS: readonly CatalogueIssuer[] = [
  {
    // The fully set-up issuer.
    id: "halcyon-securities",
    name: "Halcyon Securities (simulated)",
    authorizedCategories: [
      CATEGORY.equity,
      CATEGORY.fund,
      CATEGORY.property,
      CATEGORY.credit,
      CATEGORY.dollar,
    ],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    dossier: "HALCYON-SECURITIES",
  },
  {
    // Registered, review pending: stays `restricted`, so its representations cannot be activated.
    id: "meridian-assets",
    name: "Meridian Assets (simulated)",
    authorizedCategories: [CATEGORY.equity],
    verification: "unverified",
    activate: false,
    finalStatus: "restricted",
    dossier: "MERIDIAN-ASSETS",
  },
  {
    // Active while its token is registered and its pair approved, then deprecated (terminal).
    id: "orchard-trust",
    name: "Orchard Trust (simulated)",
    authorizedCategories: [CATEGORY.fund],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "deprecated",
    dossier: "ORCHARD-TRUST",
  },
  {
    // Rejected before it issued anything (terminal); it has no representation.
    id: "vantage-credit",
    name: "Vantage Credit (simulated)",
    authorizedCategories: [CATEGORY.credit],
    verification: "unverified",
    activate: false,
    finalStatus: "rejected",
    dossier: "VANTAGE-CREDIT",
  },
];

const SYNTHETIC_RIGHTS = "None. The claim confers no economic rights.";
const SYNTHETIC_LEGAL = "None. There is no legal entity, contract or trust behind it.";
const ALLOWLIST_ONLY = "Testnet allowlist only; not a regulatory eligibility regime.";

export const CLAIMS: readonly CatalogueClaim[] = [
  {
    id: "syn-acme",
    name: "Synthetic Acme Corp ordinary share",
    category: CATEGORY.equity,
    claimDescription: "A fictional claim to one ordinary share of Acme Corp, a fictional company.",
    unitDefinition: "1 canonical unit = 1 fictional Acme Corp ordinary share",
    denomination: "USD, as a simulated price only",
    economicRights: SYNTHETIC_RIGHTS,
    legalClaimStructure: SYNTHETIC_LEGAL,
    redemptionTerms: "None. The claim cannot be redeemed.",
    valuationMethod: "Simulated price feed; not a market price.",
    eligibilityRestrictions: ALLOWLIST_ONLY,
    riskDisclosures: [
      "Not backed by any asset; prices are simulated.",
      "A fictional dividend appears as a price step only; nothing on chain models corporate actions.",
    ],
    dossier: "SYN-ACME",
  },
  {
    id: "syn-ustb",
    name: "Synthetic Treasury Bill Fund unit",
    category: CATEGORY.fund,
    claimDescription: "A fictional claim to one unit of a fictional Treasury money-market fund.",
    unitDefinition: "1 canonical unit = 1 fictional fund unit with a nominal NAV of 1 USD",
    denomination: "USD, as a simulated NAV only",
    economicRights: SYNTHETIC_RIGHTS,
    legalClaimStructure: "None. There is no fund, manager, custodian or trust behind it.",
    redemptionTerms: "None. The claim cannot be redeemed at NAV or at any other price.",
    valuationMethod: "Simulated NAV accruing about 4.5% a year; not a published NAV.",
    eligibilityRestrictions: ALLOWLIST_ONLY,
    riskDisclosures: [
      "Nothing is held, invested or redeemable; NAV and price are simulated.",
      "A smoothly rising NAV is a property of the simulator, not evidence of any return.",
    ],
    dossier: "SYN-USTB",
  },
  {
    id: "syn-villa",
    name: "Synthetic Villa Azul property record",
    category: CATEGORY.property,
    claimDescription: "A fictional record of one fictional villa, Villa Azul.",
    unitDefinition: "1 canonical unit = the whole fictional property; the unit supply is 1",
    denomination: "USD, as a simulated appraisal price only",
    economicRights: SYNTHETIC_RIGHTS,
    legalClaimStructure: "None. There is no deed, title register, trust or company behind it.",
    redemptionTerms: "None. The record cannot be redeemed, sold or fractionalised.",
    valuationMethod: "Simulated appraisal series; not a valuation.",
    eligibilityRestrictions: ALLOWLIST_ONLY,
    riskDisclosures: [
      "Not backed by any property; prices are simulated.",
      "A supply of one is not enforced against a second record of the same fictional villa.",
    ],
    dossier: "SYN-VILLA",
  },
  {
    id: "syn-credit",
    name: "Synthetic Private Credit Note 2028",
    category: CATEGORY.credit,
    claimDescription: "A fictional senior note issued by a fictional borrower, Larkspur Logistics.",
    unitDefinition: "1 canonical unit = 1 fictional note of 100 USD nominal",
    denomination: "USD, as a simulated NAV only",
    economicRights: "None. The claim confers no payment rights.",
    legalClaimStructure: "None. There is no borrower, loan agreement, security or trustee.",
    redemptionTerms:
      "Narrative only: maturity 2028-03-31, redemption at nominal plus accrued interest. Not implemented anywhere.",
    valuationMethod: "Simulated NAV accruing about 7% a year toward maturity; not a valuation.",
    eligibilityRestrictions: ALLOWLIST_ONLY,
    riskDisclosures: [
      "Not backed by any loan; NAV and prices are simulated.",
      "Maturity and redemption terms are text: no contract pays out or burns anything at maturity.",
    ],
    dossier: "SYN-CREDIT",
  },
  {
    id: "syn-usd",
    name: "Synthetic Dollar",
    category: CATEGORY.dollar,
    claimDescription: "A fictional claim to one US dollar.",
    unitDefinition: "1 canonical unit = 1 fictional US dollar",
    denomination: "USD, as a simulated price only",
    economicRights: SYNTHETIC_RIGHTS,
    legalClaimStructure: "None. There is no reserve, issuer obligation or bank account.",
    redemptionTerms: "None. The claim cannot be redeemed.",
    valuationMethod: "Simulated price reverting to 1 USD; a peg in the fiction only.",
    eligibilityRestrictions: ALLOWLIST_ONLY,
    riskDisclosures: [
      "Nothing backs the peg; the simulator pulls the price toward 1 USD.",
      "A real dollar-pegged token has reserve and issuer risk that is not modelled here.",
    ],
    dossier: "SYN-USD",
  },
  {
    id: "syn-nova",
    name: "Synthetic Nova Systems ordinary share",
    category: CATEGORY.equity,
    claimDescription:
      "A fictional claim to one ordinary share of Nova Systems, a fictional company. A 2-for-1 split was announced on 2026-11-03 for 2026-12-15 and has not been applied.",
    unitDefinition: "1 canonical unit = 1 fictional Nova Systems ordinary share, before the split",
    denomination: "USD, as a simulated price only",
    economicRights: SYNTHETIC_RIGHTS,
    legalClaimStructure: SYNTHETIC_LEGAL,
    redemptionTerms: "None. The claim cannot be redeemed.",
    valuationMethod: "Simulated price feed that does not include the split; not a market price.",
    eligibilityRestrictions: ALLOWLIST_ONLY,
    riskDisclosures: [
      "Not backed by any asset; prices are simulated.",
      "The announced split is a narrative: nothing on chain implements corporate actions yet, and nothing will change on the effective date.",
    ],
    dossier: "SYN-NOVA",
  },
];

const representation = (
  r: Pick<CatalogueRepresentation, "id" | "claimId" | "issuerId" | "name" | "symbol" | "decimals"> &
    Partial<CatalogueRepresentation>,
): CatalogueRepresentation => ({
  unitsPerToken: rational(1n),
  adminCapabilities: WITH_FAUCET,
  custodyDescription: NONE,
  redemptionMechanism: NONE,
  startingSupply: tokens(1_000_000),
  vaultInventory: 0n,
  faucet: true,
  convertible: true,
  bridgeable: false,
  ...r,
});

export const REPRESENTATIONS: readonly CatalogueRepresentation[] = [
  representation({
    id: "tacme-h",
    claimId: "syn-acme",
    issuerId: "halcyon-securities",
    name: "SYNTHETIC TEST Acme Share (Halcyon)",
    symbol: "TACME-H",
    decimals: 6,
    bridgeable: true,
  }),
  representation({
    // Intentionally 0.1 unit per token with 8 decimals, like TGOLD-B in the MVP.
    id: "tacme-m",
    claimId: "syn-acme",
    issuerId: "meridian-assets",
    name: "SYNTHETIC TEST Acme Share (Meridian)",
    symbol: "TACME-M",
    decimals: 8,
    unitsPerToken: rational(1n, 10n),
    startingSupply: tokens(10_000_000),
  }),
  representation({
    id: "tustb-h",
    claimId: "syn-ustb",
    issuerId: "halcyon-securities",
    name: "SYNTHETIC TEST Treasury Fund (Halcyon)",
    symbol: "TUSTB-H",
    decimals: 6,
    startingSupply: tokens(10_000_000),
    vaultInventory: tokens(500_000),
    bridgeable: true,
  }),
  representation({
    id: "tustb-o",
    claimId: "syn-ustb",
    issuerId: "orchard-trust",
    name: "SYNTHETIC TEST Treasury Fund (Orchard)",
    symbol: "TUSTB-O",
    decimals: 8,
    startingSupply: tokens(10_000_000),
    vaultInventory: tokens(500_000),
  }),
  representation({
    // One indivisible record: exactly one token, no faucet, nothing to convert against.
    id: "tvilla-1",
    claimId: "syn-villa",
    issuerId: "halcyon-securities",
    name: "SYNTHETIC TEST Villa Azul Record",
    symbol: "TVILLA-1",
    decimals: 0,
    adminCapabilities: OWNER_CAPABILITIES,
    custodyDescription: "None. A fictional property record; no deed, title or custodian exists.",
    startingSupply: tokens(1),
    faucet: false,
    convertible: false,
    bridgeable: true,
  }),
  representation({
    id: "tcredit-1",
    claimId: "syn-credit",
    issuerId: "halcyon-securities",
    name: "SYNTHETIC TEST Private Credit Note 2028",
    symbol: "TCREDIT-1",
    decimals: 6,
    redemptionMechanism:
      "None. The simulated maturity and redemption terms are narrative; nothing on chain implements them.",
    startingSupply: tokens(100_000),
  }),
  representation({
    id: "tusd-h",
    claimId: "syn-usd",
    issuerId: "halcyon-securities",
    name: "SYNTHETIC TEST Dollar (Halcyon)",
    symbol: "TUSD-H",
    decimals: 6,
    startingSupply: tokens(10_000_000),
    bridgeable: true,
  }),
  representation({
    id: "tnova-m",
    claimId: "syn-nova",
    issuerId: "meridian-assets",
    name: "SYNTHETIC TEST Nova Share (Meridian)",
    symbol: "TNOVA-M",
    decimals: 8,
  }),
];

/** The issuer of a representation; its dossier is the representation's evidence. */
export function issuerOf(rep: CatalogueRepresentation): CatalogueIssuer {
  const issuer = ISSUERS.find((i) => i.id === rep.issuerId);
  if (!issuer) throw new Error(`representation ${rep.id} names unknown issuer ${rep.issuerId}`);
  return issuer;
}

/** Contract account of a catalogue token: a sub-account of the deployer named by representation id. */
export function tokenAccount(representationId: string, deployerId: string): string {
  return `${representationId}.${deployerId}`;
}

/** Canonical units per smallest token unit, as the contract stores it (unreduced). */
export function unitMultiplier(rep: CatalogueRepresentation): Rational {
  return rational(rep.unitsPerToken.num, rep.unitsPerToken.den * 10n ** BigInt(rep.decimals));
}

export const RELATIONSHIPS: readonly CatalogueRelationship[] = [
  {
    a: "tacme-h",
    b: "tacme-m",
    claimId: "syn-acme",
    scope: "Parity conversion of synthetic test tokens through the controlled test vault only.",
    rationale:
      "Both are test representations of SYN-ACME; ratio derived from unit multipliers (1 tacme-h = 10 tacme-m).",
    approvalRationale:
      "Not approved: tacme-m cannot be activated while meridian-assets is restricted.",
    approve: false,
  },
  {
    a: "tustb-h",
    b: "tustb-o",
    claimId: "syn-ustb",
    scope: "Parity conversion of synthetic test tokens through the controlled test vault only.",
    rationale:
      "Both are test representations of SYN-USTB; ratio derived from unit multipliers (1 whole token of each = 1 unit).",
    approvalRationale:
      "Approved for the demo catalogue while orchard-trust was active; self-reviewed by the project team.",
    approve: true,
  },
];
