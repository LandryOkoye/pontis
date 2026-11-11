// Plain-language copy for every state, classification and refusal the product can show.
// Rules (BuildPlan §7, brief §16.1): say "parity conversion", never bridge / exchange / swap;
// never say "verified" without saying what was checked, by whom and when.
import type {
  CompatibilityClassification,
  EvidenceProvenance,
  QuoteState,
  ReconciliationKind,
  RecordStatus,
  RefusalCode,
  VerificationStatus,
} from "@pontis/domain";

export type Tone = "gold" | "parity" | "similar" | "ion" | "warn" | "danger" | "neutral";

export const CLASSIFICATION: Record<
  CompatibilityClassification,
  { label: string; tone: Tone; short: string; meaning: string }
> = {
  DIRECT_EQUIVALENT: {
    label: "Direct equivalent",
    tone: "parity",
    short: "Parity conversion enabled",
    meaning:
      "Both tokens represent the same claim for a narrow, recorded scope. Once approved, they convert at the approved unit ratio.",
  },
  ECONOMICALLY_SIMILAR: {
    label: "Economically similar",
    tone: "similar",
    short: "No parity conversion",
    meaning:
      "The claims behave alike but are not the same claim. Rights, custody or redemption differ, so they are never converted at parity.",
  },
  INCOMPATIBLE: {
    label: "Incompatible",
    tone: "danger",
    short: "No route",
    meaning: "The claims differ materially. No conversion route exists between them.",
  },
  SUSPENDED: {
    label: "Suspended",
    tone: "warn",
    short: "Halted pending review",
    meaning:
      "The relationship was suspended. Suspension takes effect immediately; nothing can execute until it is reapproved.",
  },
};

export const STATE: Record<QuoteState, { label: string; tone: Tone; meaning: string }> = {
  REQUESTED: { label: "Requested", tone: "neutral", meaning: "The quote request was received." },
  ROUTED: { label: "Routed", tone: "neutral", meaning: "A route was found for the pair." },
  QUOTED: {
    label: "Quoted",
    tone: "ion",
    meaning: "A signed quote exists. It expires 60 seconds after it was issued.",
  },
  ACCEPTED: {
    label: "Accepted",
    tone: "gold",
    meaning: "You accepted the quote. It is waiting for your wallet to sign and send it.",
  },
  SUBMITTED: {
    label: "Submitted",
    tone: "gold",
    meaning: "The transaction was sent. Pontis is waiting for the contract event to be indexed.",
  },
  SETTLED: {
    label: "Settled",
    tone: "parity",
    meaning: "The contract paid out the output and emitted conversion_completed.",
  },
  EXPIRED: {
    label: "Expired",
    tone: "neutral",
    meaning: "The quote passed its 60 second window before it was used. No tokens moved.",
  },
  REJECTED: {
    label: "Rejected",
    tone: "danger",
    meaning: "The request was refused. No tokens moved.",
  },
  CANCELLED: { label: "Cancelled", tone: "neutral", meaning: "The quote was cancelled." },
  FAILED: {
    label: "Failed",
    tone: "danger",
    meaning: "The conversion did not complete on chain. The input was refunded in full.",
  },
  REQUIRES_RECONCILIATION: {
    label: "Needs reconciliation",
    tone: "warn",
    meaning:
      "What the API expected and what the chain shows do not match yet. An operator reviews it; nothing is assumed.",
  },
};

export const REFUSAL: Record<RefusalCode, { title: string; body: string; action: string }> = {
  NOT_DIRECT_EQUIVALENT: {
    title: "Not approved as direct equivalents",
    body: "A parity conversion needs an approved DIRECT_EQUIVALENT relationship. A matching ticker or unit ratio is never enough.",
    action: "Review the pair's compatibility",
  },
  RELATIONSHIP_SUSPENDED: {
    title: "This relationship is suspended",
    body: "The compatibility relationship was suspended pending review. Nothing can execute until it is reapproved.",
    action: "See the review history",
  },
  ASSET_PAUSED: {
    title: "An asset is paused",
    body: "One of the assets, its issuer or the protocol is paused or not active, so no route is open.",
    action: "Check the asset status",
  },
  NOT_ELIGIBLE: {
    title: "This account is not on the allowlist",
    body: "Conversions are limited to allowlisted testnet accounts. This is a demo control, not a regulatory eligibility check.",
    action: "Ask the operator to allowlist this account",
  },
  INSUFFICIENT_INVENTORY: {
    title: "The test vault is too low",
    body: "The controlled test vault does not hold enough of the destination asset for this amount.",
    action: "Try a smaller amount",
  },
};

export const PROVENANCE: Record<
  EvidenceProvenance,
  { label: string; tone: Tone; meaning: string }
> = {
  issuer_provided: {
    label: "Issuer provided",
    tone: "warn",
    meaning: "Supplied by the issuer. Nobody else checked it.",
  },
  third_party_attested: {
    label: "Third-party attested",
    tone: "ion",
    meaning: "A named third party attested to it. Pontis did not check it independently.",
  },
  independently_verified: {
    label: "Independently verified",
    tone: "parity",
    meaning: "Checked independently of the issuer.",
  },
};

export const VERIFICATION: Record<VerificationStatus, { label: string; tone: Tone }> = {
  unverified: { label: "Unverified", tone: "warn" },
  issuer_attested: { label: "Issuer attested", tone: "warn" },
  third_party_attested: { label: "Third-party attested", tone: "ion" },
  independently_verified: { label: "Independently verified", tone: "parity" },
};

export const RECORD: Record<RecordStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "parity" },
  restricted: { label: "Restricted", tone: "warn" },
  paused: { label: "Paused", tone: "warn" },
  deprecated: { label: "Deprecated", tone: "neutral" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const FINDING: Record<ReconciliationKind, string> = {
  STUCK_SUBMITTED: "Submitted, but no settlement event arrived",
  SETTLED_WITHOUT_EVENT: "Settled without a stored completion event",
  COMPLETION_NOT_SETTLED: "Completion event for a quote that is not settled",
  SETTLEMENT_MISMATCH: "Completion event shows other amounts or another user",
  VAULT_INSOLVENT: "Vault inventory exceeds the token balance held",
  VAULT_UNTRACKED_BALANCE: "Core holds tokens its inventory does not record",
};

/** Lifecycle order used by timelines. */
export const HAPPY_PATH: QuoteState[] = ["QUOTED", "ACCEPTED", "SUBMITTED", "SETTLED"];
