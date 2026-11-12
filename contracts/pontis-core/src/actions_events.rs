//! NEP-297 events of corporate actions, multiplier epochs, lifecycle and NAV strikes (ADR 0017
//! section 4, ADR 0018 section 5). Same `pontis` standard as `CoreEvent`; kept in its own enum so
//! each file stays small.

use crate::actions_types::ActionKind;
use crate::lifecycle_types::{AssetKind, LifecycleStage};
use crate::types::{EvidenceRef, Provenance, Ratio};
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[near(event_json(standard = "pontis"))]
pub enum ActionEvent {
    #[event_version("1.0.0")]
    CorporateActionProposed {
        id: String,
        asset_id: String,
        kind: ActionKind,
        effective_ms: u64,
        freeze_from_ms: u64,
        freeze_until_ms: u64,
        multiplier_change: Option<Ratio>,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CorporateActionEvidenceAdded {
        id: String,
        uri: String,
        sha256: String,
        provenance: Provenance,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CorporateActionApproved {
        id: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CorporateActionCancelled {
        id: String,
        reason: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    /// Emitted per representation (`representation_id` set) and once more, with `complete`, when
    /// the action reaches `applied`.
    #[event_version("1.0.0")]
    CorporateActionApplied {
        id: String,
        representation_id: Option<String>,
        complete: bool,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    MultiplierEpochAdded {
        representation_id: String,
        action_id: String,
        effective_ms: u64,
        multiplier: Ratio,
        epochs: u32,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    LifecycleStageChanged {
        representation_id: String,
        from: LifecycleStage,
        to: LifecycleStage,
        evidence_hash: Option<String>,
        note: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    LifecycleFlagsChanged {
        representation_id: String,
        kind: AssetKind,
        no_conversion: bool,
        bridge_only: bool,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    DelistRequested {
        representation_id: String,
        evidence_hash: Option<String>,
        note: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    NavStrikePosted {
        representation_id: String,
        nav_per_unit: U128,
        currency: String,
        as_of_ms: u64,
        cutoff_ms: u64,
        simulated: bool,
        source: String,
        publisher_key: String,
        timestamp_ms: u64,
    },
}

/// Convenience for the evidence added to a corporate action.
impl ActionEvent {
    pub(crate) fn evidence_added(id: &str, e: &EvidenceRef) -> ActionEvent {
        ActionEvent::CorporateActionEvidenceAdded {
            id: id.to_string(),
            uri: e.uri.clone(),
            sha256: e.sha256.clone(),
            provenance: e.provenance,
            by: e.added_by.clone(),
            timestamp_ms: e.timestamp_ms,
        }
    }
}
