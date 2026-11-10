//! Record types and input validation for the registry (brief §6.2-6.4, ADR 0001, ADR 0009).
//!
//! Canonical claim and token representation are separate entities (brief §6.1). Every record
//! carries `synthetic` and `verification_status` as data, plus evidence references.

use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId};

pub const MAX_TEXT_LEN: usize = 2_000;
pub const MAX_ID_LEN: usize = 64;
pub const MAX_LIST_LEN: usize = 32;
pub const MAX_EVIDENCE_PER_RECORD: usize = 32;
/// Same upper bound as `@pontis/domain`: 10^38 fits in u128.
pub const MAX_DECIMALS: u8 = 38;

/// Panics with `message` unless `condition` holds. Accepts a runtime-built message.
pub fn check(condition: bool, message: &str) {
    if !condition {
        env::panic_str(message);
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Active,
    Restricted,
    Paused,
    Deprecated,
    Rejected,
}

impl Status {
    /// Transitions a registrar may request. `Paused` is entered by a pauser and left only by the
    /// owner (ADR 0003); `Deprecated` and `Rejected` are terminal.
    pub fn registrar_may_move(self, to: Status) -> bool {
        matches!(
            (self, to),
            (Status::Restricted, Status::Active)
                | (Status::Restricted, Status::Rejected)
                | (Status::Restricted, Status::Deprecated)
                | (Status::Active, Status::Restricted)
                | (Status::Active, Status::Deprecated)
        )
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum Provenance {
    IssuerProvided,
    ThirdPartyAttested,
    IndependentlyVerified,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Unverified,
    IssuerAttested,
    ThirdPartyAttested,
    IndependentlyVerified,
}

impl VerificationStatus {
    /// A record may not claim more verification than its evidence supports (ADR 0009). Provenance
    /// is a label the registrar supplies, so `IndependentlyVerified` is never supported: it is
    /// reserved for a future authenticated verifier.
    pub fn supported_by(self, evidence: &[EvidenceRef]) -> bool {
        match self {
            VerificationStatus::Unverified => true,
            VerificationStatus::IssuerAttested => !evidence.is_empty(),
            VerificationStatus::ThirdPartyAttested => evidence
                .iter()
                .any(|e| e.provenance == Provenance::ThirdPartyAttested),
            VerificationStatus::IndependentlyVerified => false,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum SubjectType {
    Issuer,
    CanonicalAsset,
    Representation,
    Compatibility,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum BridgeStatus {
    None,
    Bridged,
    Wrapped,
}

/// Positive rational. Stored in lowest terms so structural equality is semantic equality.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
pub struct Ratio {
    pub num: U128,
    pub den: U128,
}

impl Ratio {
    /// Normalises to lowest terms. Panics unless both parts are positive.
    pub fn normalised(num: U128, den: U128) -> Ratio {
        check(num.0 > 0 && den.0 > 0, "ratio parts must be positive");
        let g = gcd(num.0, den.0);
        Ratio {
            num: U128(num.0 / g),
            den: U128(den.0 / g),
        }
    }

    /// `self / other` in lowest terms, or `None` if an intermediate product overflows u128.
    pub fn checked_div(self, other: Ratio) -> Option<Ratio> {
        let num = self.num.0.checked_mul(other.den.0)?;
        let den = self.den.0.checked_mul(other.num.0)?;
        Some(Ratio::normalised(U128(num), U128(den)))
    }
}

fn gcd(mut a: u128, mut b: u128) -> u128 {
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

/// Evidence reference (ADR 0009). `sha256` is the lowercase hex digest of the evidence content.
#[derive(Clone, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
pub struct EvidenceRef {
    pub uri: String,
    pub sha256: String,
    pub provenance: Provenance,
    pub description: String,
    pub added_by: AccountId,
    pub timestamp_ms: u64,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct NewEvidence {
    pub uri: String,
    pub sha256: String,
    pub provenance: Provenance,
    pub description: String,
}

#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct Issuer {
    pub id: String,
    pub name: String,
    pub jurisdiction: Option<String>,
    pub status: Status,
    pub authorized_categories: Vec<String>,
    /// Accounts the issuer controls (token contracts, admin accounts).
    pub controlled_accounts: Vec<AccountId>,
    pub contact: Option<String>,
    pub synthetic: bool,
    pub verification_status: VerificationStatus,
    pub evidence: Vec<EvidenceRef>,
    pub registered_by: AccountId,
    pub registered_at_ms: u64,
    pub last_reviewed_ms: Option<u64>,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct NewIssuer {
    pub id: String,
    pub name: String,
    pub jurisdiction: Option<String>,
    pub authorized_categories: Vec<String>,
    pub controlled_accounts: Vec<AccountId>,
    pub contact: Option<String>,
    pub synthetic: bool,
    pub verification_status: VerificationStatus,
}

#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct CanonicalAsset {
    pub id: String,
    pub name: String,
    pub category: String,
    pub claim_description: String,
    pub unit_definition: String,
    pub denomination: Option<String>,
    pub economic_rights: String,
    pub legal_claim_structure: String,
    pub jurisdiction: Option<String>,
    pub redemption_terms: String,
    pub valuation_method: Option<String>,
    pub eligibility_restrictions: String,
    pub risk_disclosures: Vec<String>,
    pub synthetic: bool,
    pub verification_status: VerificationStatus,
    pub status: Status,
    pub evidence: Vec<EvidenceRef>,
    pub registered_by: AccountId,
    pub registered_at_ms: u64,
    pub last_reviewed_ms: Option<u64>,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct NewCanonicalAsset {
    pub id: String,
    pub name: String,
    pub category: String,
    pub claim_description: String,
    pub unit_definition: String,
    pub denomination: Option<String>,
    pub economic_rights: String,
    pub legal_claim_structure: String,
    pub jurisdiction: Option<String>,
    pub redemption_terms: String,
    pub valuation_method: Option<String>,
    pub eligibility_restrictions: String,
    pub risk_disclosures: Vec<String>,
    pub synthetic: bool,
    pub verification_status: VerificationStatus,
}

/// A token representation. `canonical_asset_id` is a candidate association, never proof of
/// equivalence (brief §6.4). Decimals and multiplier are immutable after registration (ADR 0001).
#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct Representation {
    pub id: String,
    pub canonical_asset_id: String,
    pub issuer_id: String,
    /// NEAR account of the NEP-141 token contract.
    pub account_id: AccountId,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    /// Canonical units per smallest token unit.
    pub unit_multiplier: Ratio,
    pub admin_capabilities: Vec<String>,
    pub custody_description: String,
    pub redemption_mechanism: String,
    pub transfer_policy_summary: String,
    pub bridge_status: BridgeStatus,
    pub synthetic: bool,
    pub verification_status: VerificationStatus,
    pub status: Status,
    pub evidence: Vec<EvidenceRef>,
    pub registered_by: AccountId,
    pub registered_at_ms: u64,
    pub last_reviewed_ms: Option<u64>,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct NewRepresentation {
    pub id: String,
    pub canonical_asset_id: String,
    pub issuer_id: String,
    pub account_id: AccountId,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub unit_multiplier: Ratio,
    pub admin_capabilities: Vec<String>,
    pub custody_description: String,
    pub redemption_mechanism: String,
    pub transfer_policy_summary: String,
    pub bridge_status: BridgeStatus,
    pub synthetic: bool,
    pub verification_status: VerificationStatus,
}

// ---- validation helpers ----

/// Record IDs are lowercase `[a-z0-9-]`, 2 to 64 characters, not starting or ending with `-`.
pub fn validate_id(id: &str, what: &str) {
    let ok_chars = id
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    check(
        id.len() >= 2
            && id.len() <= MAX_ID_LEN
            && ok_chars
            && !id.starts_with('-')
            && !id.ends_with('-'),
        &format!("{what} id must be 2-{MAX_ID_LEN} chars of a-z, 0-9 and '-'"),
    );
}

/// Required text field: non-blank, bounded.
pub fn require_text(value: &str, field: &str) {
    check(
        !value.trim().is_empty(),
        &format!("{field} must not be empty"),
    );
    check(value.len() <= MAX_TEXT_LEN, &format!("{field} is too long"));
}

pub fn bound_optional_text(value: &Option<String>, field: &str) {
    if let Some(v) = value {
        check(v.len() <= MAX_TEXT_LEN, &format!("{field} is too long"));
    }
}

/// Required list of non-blank bounded strings; at least one when `non_empty`.
pub fn require_list(items: &[String], field: &str, non_empty: bool) {
    check(
        !(non_empty && items.is_empty()),
        &format!("{field} must not be empty"),
    );
    check(
        items.len() <= MAX_LIST_LEN,
        &format!("{field} has too many entries"),
    );
    for item in items {
        require_text(item, field);
    }
}

/// `sha256` must be 64 lowercase hex characters.
pub fn validate_sha256(value: &str) {
    check(
        value.len() == 64
            && value
                .bytes()
                .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')),
        "sha256 must be 64 lowercase hex characters",
    );
}

// ---- compatibility (brief §6.5-6.7, ADR 0004) ----

/// Only `DirectEquivalent` + an approved relationship enables parity conversion.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Classification {
    DirectEquivalent,
    EconomicallySimilar,
    Incompatible,
    /// Set by suspension; never proposed directly.
    Suspended,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum RelationshipStatus {
    Proposed,
    Approved,
    Rejected,
    Suspended,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum ReviewAction {
    Proposed,
    Approved,
    Rejected,
    Suspended,
    Reapproved,
}

/// One immutable entry of a relationship's append-only history. `version` equals the entry's
/// 1-based position, so the history length is always the current version.
#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct CompatibilityVersion {
    pub version: u64,
    pub action: ReviewAction,
    pub classification: Classification,
    pub status: RelationshipStatus,
    pub ratio: Ratio,
    pub scope: String,
    pub rationale: String,
    pub actor: AccountId,
    pub timestamp_ms: u64,
}

/// One relationship per unordered pair of representations, keyed `"{a}:{b}"` with `a < b`.
/// `ratio` is output smallest units of `b` per smallest unit of `a` (the reverse direction is the
/// reciprocal). `version` increases on every recorded change.
#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct Compatibility {
    pub id: String,
    pub representation_a_id: String,
    pub representation_b_id: String,
    pub classification: Classification,
    pub ratio: Ratio,
    pub scope: String,
    pub rationale: String,
    pub status: RelationshipStatus,
    pub version: u64,
    pub proposed_by: AccountId,
    pub approved_by: Option<AccountId>,
    pub evidence: Vec<EvidenceRef>,
    pub history: Vec<CompatibilityVersion>,
    pub updated_at_ms: u64,
}

/// Shared by registry and compatibility evidence: a bounded URI, a sha256 digest and a description.
pub fn validate_new_evidence(evidence: &NewEvidence) {
    check(
        !evidence.uri.trim().is_empty() && evidence.uri.len() <= MAX_TEXT_LEN,
        "uri must be 1-2000 chars",
    );
    validate_sha256(&evidence.sha256);
    require_text(&evidence.description, "description");
    check(
        evidence.provenance != Provenance::IndependentlyVerified,
        "independently_verified evidence is not accepted: no authenticated verifier exists in this MVP",
    );
}

/// Why `ft_on_transfer` returned the input instead of converting or funding. Emitted in
/// `conversion_rejected`; the API maps these to its error codes.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RejectReason {
    UnknownToken,
    InvalidMsg,
    NotOwner,
    InventoryOverflow,
    SignerNotSet,
    BadSignature,
    UnsupportedVersion,
    ContractMismatch,
    QuoteExpired,
    WrongSender,
    WrongToken,
    AmountMismatch,
    RelationshipSuspended,
    AssetPaused,
    NotDirectEquivalent,
    CompatibilityChanged,
    PolicyChanged,
    FeeChanged,
    NotEligible,
    OutputMismatch,
    AmountTooSmall,
    InsufficientInventory,
    NonceUsed,
}
