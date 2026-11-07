// Entity types: the MVP subset of brief §14.2. In-process model: amounts are `bigint`, ratios are
// `Rational`, timestamps are `Date`. The wire shapes (strings, ISO-8601) live in `@pontis/api-types`.
// Canonical claim and token representation are separate entities (brief §6.1).

import type {
  BridgeStatus,
  CompatibilityClassification,
  CoreEventName,
  EvidenceProvenance,
  EvidenceSubjectType,
  Network,
  RecordStatus,
  RelationshipStatus,
  ReviewAction,
  RouteType,
  TokenStandard,
  VerificationStatus,
} from "./enums.ts";
import type { QuoteState } from "./quote-state.ts";
import type { Rational } from "./rational.ts";

/** Flags carried by every registry record (ADR 0009). */
export interface RecordFlags {
  readonly synthetic: boolean;
  readonly verificationStatus: VerificationStatus;
}

export interface EvidenceRef {
  readonly id: string;
  readonly subjectType: EvidenceSubjectType;
  readonly subjectId: string;
  readonly uri: string;
  /** Hex sha256 of the evidence content at registration. */
  readonly sha256: string;
  readonly provenance: EvidenceProvenance;
  readonly description: string;
  readonly addedBy: string;
  readonly addedAt: Date;
}

export interface Issuer extends RecordFlags {
  readonly id: string;
  readonly name: string;
  readonly jurisdiction: string | null;
  readonly status: RecordStatus;
  readonly authorizedCategories: readonly string[];
  /** On-chain accounts the issuer controls (token contracts, admin accounts). */
  readonly controlledAccounts: readonly string[];
  readonly contact: string | null;
  readonly lastReviewedAt: Date | null;
}

export interface CanonicalAsset extends RecordFlags {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly claimDescription: string;
  readonly unitDefinition: string;
  readonly denomination: string | null;
  readonly economicRights: string;
  readonly legalClaimStructure: string;
  readonly jurisdiction: string | null;
  readonly redemptionTerms: string;
  readonly valuationMethod: string | null;
  readonly eligibilityRestrictions: string;
  readonly riskDisclosures: readonly string[];
  readonly status: RecordStatus;
  readonly lastReviewedAt: Date | null;
}

export interface AssetRepresentation extends RecordFlags {
  readonly id: string;
  /** Candidate association only, not proof of equivalence. */
  readonly canonicalAssetId: string;
  readonly issuerId: string;
  readonly network: Network;
  /** NEAR account ID of the token contract. */
  readonly accountId: string;
  readonly standard: TokenStandard;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  /** Canonical units per smallest unit. Immutable after registration (ADR 0001). */
  readonly unitMultiplier: Rational;
  readonly adminCapabilities: readonly string[];
  readonly custodyDescription: string;
  readonly redemptionMechanism: string;
  readonly transferPolicySummary: string;
  readonly bridgeStatus: BridgeStatus;
  readonly status: RecordStatus;
  readonly lastReviewedAt: Date | null;
}

/** One immutable entry of a relationship's append-only history (ADR 0004). */
export interface CompatibilityVersion {
  readonly version: number;
  readonly classification: CompatibilityClassification;
  readonly status: RelationshipStatus;
  readonly ratio: Rational;
  readonly scope: string;
  readonly rationale: string;
  readonly actor: string;
  readonly at: Date;
}

/** One relationship per unordered pair. `ratio` is output smallest units of B per smallest unit of A. */
export interface CompatibilityRelationship {
  readonly id: string;
  readonly representationAId: string;
  readonly representationBId: string;
  readonly classification: CompatibilityClassification;
  readonly ratio: Rational;
  readonly scope: string;
  readonly rationale: string;
  readonly status: RelationshipStatus;
  readonly version: number;
  readonly proposedBy: string;
  readonly approvedBy: string | null;
  readonly updatedAt: Date;
  readonly history: readonly CompatibilityVersion[];
}

export interface CompatibilityReview {
  readonly id: string;
  readonly relationshipId: string;
  readonly action: ReviewAction;
  readonly version: number;
  readonly actor: string;
  readonly rationale: string;
  readonly at: Date;
}

export interface TransferPolicy {
  readonly representationId: string;
  readonly allowlistRequired: boolean;
  /** Global counter; bumps on rule changes, not on allowlist membership changes (ADR 0004). */
  readonly policyVersion: number;
  readonly updatedAt: Date;
}

export interface RouteDescriptor {
  readonly type: RouteType;
  readonly venue: "CONTROLLED_TEST_VAULT";
  readonly network: Network;
  readonly settlement: "ATOMIC";
}

export interface Quote {
  readonly id: string;
  readonly accountId: string;
  readonly fromId: string;
  readonly toId: string;
  readonly amountIn: bigint;
  readonly amountOutGross: bigint;
  readonly fee: bigint;
  readonly amountOut: bigint;
  readonly ratio: Rational;
  readonly feeBps: number;
  /** Hex of the 16-byte nonce that doubles as the on-chain operation ID (ADR 0006). */
  readonly nonce: string;
  readonly expiresAt: Date;
  readonly compatibilityVersion: number;
  readonly policyVersion: number;
  readonly route: RouteDescriptor;
  readonly warnings: readonly string[];
  readonly state: QuoteState;
  readonly createdAt: Date;
}

export interface Conversion {
  readonly id: string;
  readonly quoteId: string;
  readonly idempotencyKey: string;
  readonly txHash: string | null;
  readonly failureReason: string | null;
  readonly submittedAt: Date | null;
  readonly settledAt: Date | null;
  readonly createdAt: Date;
}

/** A parsed `pontis-core` NEP-297 event, unique by (receiptId, logIndex). */
export interface SettlementEvent {
  readonly id: string;
  readonly receiptId: string;
  readonly logIndex: number;
  readonly blockHeight: number;
  readonly blockTimestamp: Date;
  readonly txHash: string;
  readonly eventName: CoreEventName;
  readonly data: unknown;
  readonly conversionId: string | null;
}

export interface AuditLogEntry {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly subject: string;
  readonly detail: unknown;
  readonly at: Date;
}
