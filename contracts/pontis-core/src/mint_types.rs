//! Mint request records (ADR 0020 section 6).

use crate::reserve_types::ReserveState;
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum MintStatus {
    Requested,
    Minting,
    Minted,
    Failed,
    Cancelled,
}

/// One subscription: an issuer account asks for supply for a recipient, and the core mints it
/// only up to the attested headroom.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct MintRequest {
    pub id: u64,
    pub representation_id: String,
    pub recipient: AccountId,
    pub amount: U128,
    pub reference: String,
    pub status: MintStatus,
    pub requested_by: AccountId,
    pub requested_ms: u64,
    pub resolved_ms: Option<u64>,
    pub failure: Option<String>,
}

/// `get_mint_headroom`: what a mint may still take, and why.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [json])]
pub struct MintHeadroom {
    pub headroom_units: U128,
    pub circulating_units: U128,
    pub attested_units: U128,
    pub state: ReserveState,
    /// True when the policy's `pause_mint` action currently refuses mints.
    pub mint_paused: bool,
}
