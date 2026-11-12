//! The lifecycle side record of a representation (ADR 0018 section 1). It sits beside `Status`
//! and never replaces it: an absent record is a `fungible` asset in stage `active`.

use near_sdk::{near, AccountId};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Fungible,
    NavFund,
    TermInstrument,
    Unique,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum LifecycleStage {
    Active,
    /// Reserved name: for a `nav_fund` the window is computed from the latest strike, never stored.
    NavStrikeWindow,
    Matured,
    Redeeming,
    Redeemed,
    Delisted,
}

impl LifecycleStage {
    /// The transitions `set_lifecycle_stage` and `approve_delist` may make (ADR 0018 section 2).
    pub fn may_move(self, to: LifecycleStage) -> bool {
        use LifecycleStage::*;
        matches!(
            (self, to),
            (Active, Matured)
                | (Active, Delisted)
                | (Matured, Redeeming)
                | (Matured, Delisted)
                | (Redeeming, Redeemed)
                | (Redeemed, Delisted)
        )
    }
}

/// One append-only entry of the stage history.
#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct LifecycleEntry {
    pub from: LifecycleStage,
    pub to: LifecycleStage,
    pub by: AccountId,
    pub at_ms: u64,
    pub evidence_hash: Option<String>,
    pub note: String,
}

/// The registrar's open request to delist; `approve_delist` consumes it.
#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct DelistRequest {
    pub by: AccountId,
    pub evidence_hash: Option<String>,
    pub note: String,
    pub at_ms: u64,
}

#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct Lifecycle {
    pub kind: AssetKind,
    /// The route is refused with `NOT_CONVERTIBLE`.
    pub no_conversion: bool,
    /// Informational for the bridge (phase 6); implies `no_conversion`.
    pub bridge_only: bool,
    pub stage: LifecycleStage,
    pub history: Vec<LifecycleEntry>,
    pub delist_request: Option<DelistRequest>,
}

/// What an absent record means: a fungible asset in stage `active`.
pub static DEFAULT_LIFECYCLE: Lifecycle = Lifecycle {
    kind: AssetKind::Fungible,
    no_conversion: false,
    bridge_only: false,
    stage: LifecycleStage::Active,
    history: Vec::new(),
    delist_request: None,
};

impl Lifecycle {
    pub fn blocks_conversion(&self) -> bool {
        self.no_conversion || self.bridge_only
    }
}
