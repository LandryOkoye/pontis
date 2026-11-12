//! Corporate action records (ADR 0017 section 1) and their input validation.
//!
//! An action belongs to a canonical asset. `status` is stored (`proposed`, `approved`, `applied`,
//! `cancelled`); "frozen" is never stored, it is computed from the clock in `action_route.rs`.

use crate::types::{check, EvidenceRef, Ratio};
use near_sdk::{near, AccountId};

pub const MAX_ACTIONS_PER_ASSET: usize = 32;
pub const MAX_EPOCHS: usize = 16;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    Split,
    ReverseSplit,
    DividendCash,
    DividendStock,
    Merger,
    SpinOff,
    Delisting,
    SymbolChange,
    Custom,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum ActionStatus {
    Proposed,
    Approved,
    Applied,
    Cancelled,
}

/// One append-only entry: the status entered, who did it and when.
#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct ActionHistoryEntry {
    pub status: ActionStatus,
    pub by: AccountId,
    pub at_ms: u64,
    pub note: String,
}

#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct CorporateAction {
    /// `{asset_id}-{n}`.
    pub id: String,
    pub asset_id: String,
    pub kind: ActionKind,
    pub announced_at_ms: u64,
    pub ex_date_ms: u64,
    pub effective_ms: u64,
    pub freeze_from_ms: u64,
    pub freeze_until_ms: u64,
    /// Factor applied to every wrapper's multiplier: `new = old * multiplier_change`.
    pub multiplier_change: Option<Ratio>,
    pub evidence: Vec<EvidenceRef>,
    pub status: ActionStatus,
    pub proposed_by: AccountId,
    pub approved_by: Option<AccountId>,
    pub applied_representations: Vec<String>,
    pub history: Vec<ActionHistoryEntry>,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct NewCorporateAction {
    pub asset_id: String,
    pub kind: ActionKind,
    pub announced_at_ms: u64,
    pub ex_date_ms: u64,
    pub effective_ms: u64,
    pub freeze_from_ms: u64,
    pub freeze_until_ms: u64,
    pub multiplier_change: Option<Ratio>,
}

/// One step of a representation's multiplier schedule. The first is the registration multiplier
/// (`effective_ms = 0`, `action_id = "genesis"`).
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct MultiplierEpoch {
    pub effective_ms: u64,
    pub multiplier: Ratio,
    pub action_id: String,
}

impl NewCorporateAction {
    /// Panics unless the input is valid; returns the multiplier change in lowest terms.
    pub fn validate(&self) -> Option<Ratio> {
        check(
            self.announced_at_ms <= self.freeze_from_ms,
            "announced_at_ms must not be after freeze_from_ms",
        );
        check(
            self.freeze_from_ms <= self.effective_ms && self.effective_ms <= self.freeze_until_ms,
            "the freeze window must contain effective_ms",
        );
        let required = matches!(self.kind, ActionKind::Split | ActionKind::ReverseSplit);
        let forbidden = matches!(
            self.kind,
            ActionKind::DividendCash | ActionKind::SymbolChange | ActionKind::Custom
        );
        check(
            !required || self.multiplier_change.is_some(),
            "a split or reverse_split needs a multiplier_change",
        );
        check(
            !forbidden || self.multiplier_change.is_none(),
            "this kind of action may not change the multiplier",
        );
        self.multiplier_change
            .map(|r| Ratio::normalised(r.num, r.den))
    }
}
