//! NEP-297 events (ADR 0002). Every state-changing method emits one or more of these.
//! The log line is `EVENT_JSON:{"standard":"pontis","version":"1.0.0","event":"<name>","data":{...}}`.
//! `data` is a single JSON object per event. Amounts are decimal strings, times are ms since epoch.

use crate::types::{Classification, Ratio, Status, SubjectType};
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
}
