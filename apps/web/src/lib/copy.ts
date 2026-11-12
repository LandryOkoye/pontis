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
  PRICE_DEVIATION: {
    title: "The market price is too far from the ratio",
    body: "The market price of one asset disagrees with the approved ratio by more than this route allows. The conversion is refused rather than filled at a bad rate.",
    action: "Try again later",
  },
  PRICE_STALE: {
    title: "The price reference is out of date",
    body: "The market price used to check this route is older than allowed. Nothing converts on a stale price.",
    action: "Try again in a moment",
  },
  PRICE_UNAVAILABLE: {
    title: "No price reference is available",
    body: "A current market price could not be read for this pair, so the route cannot be checked.",
    action: "Try again later",
  },
  AMOUNT_BELOW_MIN: {
    title: "The amount is below the minimum",
    body: "This route only accepts amounts from the minimum set in its terms.",
    action: "Try a larger amount",
  },
  AMOUNT_ABOVE_MAX: {
    title: "The amount is above the maximum",
    body: "This route only accepts amounts up to the maximum set in its terms.",
    action: "Try a smaller amount",
  },
  WINDOW_LIMIT_EXCEEDED: {
    title: "The window limit is reached",
    body: "This route has a volume limit for the current window, and this amount would exceed it.",
    action: "Try again in the next window",
  },
  CORPORATE_ACTION_FREEZE: {
    title: "A corporate action freeze is in effect",
    body: "Conversions of this asset are paused for a scheduled corporate action.",
    action: "Try again after the freeze window",
  },
  CORPORATE_ACTION_PENDING: {
    title: "A corporate action is not applied everywhere yet",
    body: "An approved corporate action has not taken effect on every wrapper of this asset, so the route is held.",
    action: "Try again once it is applied",
  },
  EPOCH_MISMATCH: {
    title: "The two assets are at different multiplier epochs",
    body: "The multipliers of the two assets moved apart, so the ratio no longer applies to both sides.",
    action: "Check the asset status",
  },
  NOT_CONVERTIBLE: {
    title: "This asset cannot convert now",
    body: "Its lifecycle stage does not allow conversions.",
    action: "Check the asset status",
  },
  LIFECYCLE_BLOCKED: {
    title: "The asset lifecycle blocks this route",
    body: "The asset is matured, redeeming, redeemed or delisted, so it cannot be converted in this direction.",
    action: "Check the asset status",
  },
  NAV_WINDOW_CLOSED: {
    title: "The NAV strike window is closed",
    body: "This NAV-based asset converts only inside its strike window.",
    action: "Try during the next strike window",
  },
  RESERVE_RESTRICTED: {
    title: "Reserves do not cover this supply",
    body: "The attested reserves for this asset do not cover its outstanding supply, so conversions are restricted. The attestation is a simulated demo record, not an audit.",
    action: "See the reserve status",
  },
  RESERVE_STALE: {
    title: "Reserve attestations are stale",
    body: "The reserve attestations for this asset are older than the policy allows, or missing. Conversions are paused until they are refreshed.",
    action: "See the reserve status",
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
  CORPORATE_ACTION_OVERDUE: "Approved corporate action not applied by a live wrapper",
  RESERVE_BREACH: "Chain reserve status is breached and not recorded",
  RESERVE_STALE: "Reserve attestations are older than the policy allows",
  REDEMPTION_OVERDUE: "Redemption is past its deadline and still open",
  ESCROW_MISMATCH: "Open escrows, inventory and pending input do not match the token balance",
};

/** Lifecycle order used by timelines. */
export const HAPPY_PATH: QuoteState[] = ["QUOTED", "ACCEPTED", "SUBMITTED", "SETTLED"];
