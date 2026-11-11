// State enums and code lists shared by contracts, API, indexer and frontend.
// Each list is `as const` so Zod schemas (`z.enum`) and TypeScript unions derive from one source.

/**
 * Status of an issuer, canonical asset or representation (brief §6.4).
 * New records are registered as `restricted` (registered, not executable); a record can only be
 * set to `active` once it is complete (brief §19.1).
 */
export const RECORD_STATUSES = [
  "active",
  "restricted",
  "paused",
  "deprecated",
  "rejected",
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** Brief §6.5. Only `DIRECT_EQUIVALENT` enables parity conversion. */
export const COMPATIBILITY_CLASSIFICATIONS = [
  "DIRECT_EQUIVALENT",
  "ECONOMICALLY_SIMILAR",
  "INCOMPATIBLE",
  "SUSPENDED",
] as const;
export type CompatibilityClassification = (typeof COMPATIBILITY_CLASSIFICATIONS)[number];

/** Relationship lifecycle, brief §6.7: proposed -> approved | rejected, approved -> suspended. */
export const RELATIONSHIP_STATUSES = ["proposed", "approved", "rejected", "suspended"] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

/** Who produced a piece of evidence (ADR 0009). */
export const EVIDENCE_PROVENANCES = [
  "issuer_provided",
  "third_party_attested",
  "independently_verified",
] as const;
export type EvidenceProvenance = (typeof EVIDENCE_PROVENANCES)[number];

/** What has actually been verified about a record. MVP records are all `unverified` (ADR 0009). */
export const VERIFICATION_STATUSES = [
  "unverified",
  "issuer_attested",
  "third_party_attested",
  "independently_verified",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const EVIDENCE_SUBJECT_TYPES = [
  "issuer",
  "canonical_asset",
  "representation",
  "compatibility",
] as const;
export type EvidenceSubjectType = (typeof EVIDENCE_SUBJECT_TYPES)[number];

export const TOKEN_STANDARDS = ["NEP-141"] as const;
export type TokenStandard = (typeof TOKEN_STANDARDS)[number];

export const NETWORKS = ["near-testnet"] as const;
export type Network = (typeof NETWORKS)[number];

export const BRIDGE_STATUSES = ["none", "bridged", "wrapped"] as const;
export type BridgeStatus = (typeof BRIDGE_STATUSES)[number];

export const ROUTE_TYPES = ["PARITY_CONVERSION"] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

/** Review actions recorded in `compatibility_reviews`. */
export const REVIEW_ACTIONS = [
  "proposed",
  "approved",
  "rejected",
  "suspended",
  "reapproved",
  /** A route guard was set or changed (ADR 0016); the ratio and status are unchanged. */
  "guard_set",
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** Why a route or quote was refused. A subset of `ERROR_CODES`. */
export const REFUSAL_CODES = [
  "NOT_DIRECT_EQUIVALENT",
  "RELATIONSHIP_SUSPENDED",
  "ASSET_PAUSED",
  "NOT_ELIGIBLE",
  "INSUFFICIENT_INVENTORY",
  /** Route guards (ADR 0016): the market price disagrees with the ratio, or cannot be read. */
  "PRICE_DEVIATION",
  "PRICE_STALE",
  "PRICE_UNAVAILABLE",
  "AMOUNT_BELOW_MIN",
  "AMOUNT_ABOVE_MAX",
  "WINDOW_LIMIT_EXCEEDED",
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** BuildPlan §8. */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "NOT_FOUND",
  ...REFUSAL_CODES,
  "QUOTE_EXPIRED",
  "QUOTE_ALREADY_USED",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** `pontis-core` NEP-297 event names (ADR 0002). */
export const CORE_EVENT_NAMES = [
  "role_granted",
  "role_revoked",
  "ownership_transfer_proposed",
  "ownership_transferred",
  "paused",
  "unpaused",
  "issuer_registered",
  "issuer_status_changed",
  "canonical_asset_registered",
  "canonical_asset_status_changed",
  "representation_registered",
  "representation_status_changed",
  "evidence_added",
  "compatibility_proposed",
  "compatibility_approved",
  "compatibility_rejected",
  "compatibility_suspended",
  "policy_updated",
  "allowlist_updated",
  "quote_signer_set",
  "fee_updated",
  "vault_funded",
  "vault_withdrawn",
  "conversion_completed",
  "conversion_failed",
  "conversion_rejected",
] as const;
export type CoreEventName = (typeof CORE_EVENT_NAMES)[number];

/** What the reconciler (B13) can flag; each finding has one kind. */
export const RECONCILIATION_KINDS = [
  /** A `SUBMITTED` quote with no settlement event long after submission. */
  "STUCK_SUBMITTED",
  /** A `SETTLED` quote with no `conversion_completed` event stored for it. */
  "SETTLED_WITHOUT_EVENT",
  /** A stored `conversion_completed` event for a quote that is not `SETTLED`. */
  "COMPLETION_NOT_SETTLED",
  /** A `SETTLED` quote whose completion event shows other amounts or another user. */
  "SETTLEMENT_MISMATCH",
  /** Vault inventory exceeds the token balance the core holds: it owes more than it has. */
  "VAULT_INSOLVENT",
  /** The core holds more tokens than its inventory records (a direct transfer, ADR 0008). */
  "VAULT_UNTRACKED_BALANCE",
] as const;
export type ReconciliationKind = (typeof RECONCILIATION_KINDS)[number];

export const FINDING_SEVERITIES = ["critical", "warning"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
