// The demo seed catalogue as plain typed data: issuers, canonical assets, representations and
// relationships. No chain, file or database access happens here so demo tooling can import it.
// Everything is fiction. Trust states use only what the contract and ADR 0009 allow today:
// `unverified` and `issuer_attested` (the registrar recorded that the issuer supplied evidence).
// Nothing is `third_party_attested` (no third party exists) or `independently_verified` (the
// contract refuses it).

import type { Rational } from "@pontis/domain";

export type Verification = "unverified" | "issuer_attested";
export type RecordStatus = "active" | "restricted" | "deprecated" | "rejected";

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
}

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
