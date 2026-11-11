//! NEP-297 events (ADR 0002). Every state-changing method emits one or more of these.
//! The log line is `EVENT_JSON:{"standard":"pontis","version":"1.0.0","event":"<name>","data":{...}}`.
//! `data` is a single JSON object per event. Amounts are decimal strings, times are ms since epoch.

use crate::breaker::TripReason;
use crate::guard::RouteGuard;
use crate::types::{Classification, Ratio, RejectReason, Status, SubjectType};
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[derive(Clone, Copy)]
#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
pub enum RoleName {
    Registrar,
    CompatApprover,
    Pauser,
}

#[derive(Clone, Copy)]
#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
pub enum PauseScope {
    Global,
    Asset,
}

#[near(event_json(standard = "pontis"))]
pub enum CoreEvent {
    #[event_version("1.0.0")]
    RoleGranted {
        role: RoleName,
        account_id: AccountId,
        by: AccountId,
    },
    #[event_version("1.0.0")]
    RoleRevoked {
        role: RoleName,
        account_id: AccountId,
        by: AccountId,
    },
    #[event_version("1.0.0")]
    OwnershipTransferProposed {
        current_owner: AccountId,
        proposed_owner: AccountId,
    },
    #[event_version("1.0.0")]
    OwnershipTransferred {
        previous_owner: AccountId,
        new_owner: AccountId,
    },
    /// `target` is the representation ID for `scope = asset`, otherwise absent.
    #[event_version("1.0.0")]
    Paused {
        scope: PauseScope,
        target: Option<String>,
        by: AccountId,
    },
    #[event_version("1.0.0")]
    Unpaused {
        scope: PauseScope,
        target: Option<String>,
        by: AccountId,
    },
    #[event_version("1.0.0")]
    IssuerRegistered {
        id: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    IssuerStatusChanged {
        id: String,
        from: Status,
        to: Status,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CanonicalAssetRegistered {
        id: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CanonicalAssetStatusChanged {
        id: String,
        from: Status,
        to: Status,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RepresentationRegistered {
        id: String,
        canonical_asset_id: String,
        issuer_id: String,
        account_id: AccountId,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RepresentationStatusChanged {
        id: String,
        from: Status,
        to: Status,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    EvidenceAdded {
        subject_type: SubjectType,
        subject_id: String,
        uri: String,
        sha256: String,
        provenance: crate::types::Provenance,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CompatibilityProposed {
        id: String,
        version: u64,
        classification: Classification,
        ratio: Ratio,
        by: AccountId,
        timestamp_ms: u64,
    },
    /// `reapproval` is true when a suspended relationship is approved again.
    #[event_version("1.0.0")]
    CompatibilityApproved {
        id: String,
        version: u64,
        classification: Classification,
        ratio: Ratio,
        reapproval: bool,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CompatibilityRejected {
        id: String,
        version: u64,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CompatibilitySuspended {
        id: String,
        version: u64,
        by: AccountId,
        timestamp_ms: u64,
    },
    /// A policy rule changed; `policy_version` is the new global version (ADR 0004).
    #[event_version("1.0.0")]
    PolicyUpdated {
        representation_id: String,
        allowlist_required: bool,
        policy_version: u64,
        by: AccountId,
        timestamp_ms: u64,
    },
    /// Allowlist membership changed. Does not change `policy_version`.
    #[event_version("1.0.0")]
    AllowlistUpdated {
        representation_id: String,
        account_ids: Vec<AccountId>,
        allowed: bool,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    QuoteSignerSet { public_key: String, by: AccountId },
    #[event_version("1.0.0")]
    FeeUpdated { fee_bps: u16, by: AccountId },
    /// Inventory added by the owner through `ft_transfer_call` with `msg = "fund_vault"`.
    #[event_version("1.0.0")]
    VaultFunded {
        representation_id: String,
        amount: U128,
        by: AccountId,
        inventory: U128,
        timestamp_ms: u64,
    },
    /// The transfer was returned in full; `nonce` is set when a conversion quote was read.
    #[event_version("1.0.0")]
    ConversionRejected {
        reason: RejectReason,
        sender_id: AccountId,
        token: AccountId,
        amount: U128,
        nonce: Option<String>,
        timestamp_ms: u64,
    },
    /// Owner withdrawal. `success = false` means the token transfer failed and the inventory
    /// was restored.
    #[event_version("1.0.0")]
    VaultWithdrawn {
        representation_id: String,
        amount: U128,
        receiver_id: AccountId,
        success: bool,
        timestamp_ms: u64,
    },
    /// The payout succeeded. Carries the full breakdown (ADR 0007).
    #[event_version("1.0.0")]
    ConversionCompleted {
        nonce: String,
        user: AccountId,
        from_representation_id: String,
        to_representation_id: String,
        token_in: AccountId,
        token_out: AccountId,
        amount_in: U128,
        amount_out_gross: U128,
        fee: U128,
        amount_out: U128,
        ratio: Ratio,
        fee_bps: u16,
        compatibility_version: u64,
        policy_version: u64,
        timestamp_ms: u64,
    },
    /// The payout failed; inventory was restored and the input returned. The nonce stays used.
    #[event_version("1.0.0")]
    ConversionFailed {
        nonce: String,
        user: AccountId,
        reason: String,
        amount_in: U128,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    PricePublisherKeyAdded { public_key: String, by: AccountId },
    #[event_version("1.0.0")]
    PricePublisherKeyRemoved { public_key: String, by: AccountId },
    #[event_version("1.0.0")]
    PriceSubmitted {
        representation_id: String,
        price: U128,
        currency: String,
        as_of_ms: u64,
        simulated: bool,
        source: String,
        publisher_key: String,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RouteGuardSet {
        id: String,
        version: u64,
        guard: RouteGuard,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    InventoryReferenceSet {
        representation_id: String,
        reference: U128,
        by: AccountId,
    },
    #[event_version("1.0.0")]
    CircuitBreakerTripped {
        id: String,
        version: u64,
        deviation_bps: u32,
        reason: TripReason,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CircuitBreakerReset {
        id: String,
        version: u64,
        by: AccountId,
        timestamp_ms: u64,
    },
}
