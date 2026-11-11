//! Redemption terms, requests, the escrow ledger and issuer reliability counters (ADR 0020
//! section 7).

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

pub const REDEEM_PREFIX: &str = "redeem:";
pub const TERMS_DOMAIN: &[u8] = b"pontis-redeem-terms-v1";
pub const MAX_OPEN_PER_USER: usize = 20;
pub const DAY_MS: u64 = 86_400_000;
pub const MAX_FEE_BPS_REDEEM: u16 = 1_000;
pub const MIN_ACCEPT_WITHIN_MS: u64 = 1_000;
pub const MAX_ACCEPT_WITHIN_MS: u64 = 2_592_000_000;
pub const MAX_SETTLEMENT_DAYS: u16 = 30;

/// Enforced redemption terms of a representation. Window fields: `period == 0` means always
/// open; otherwise the window is open while `(now - anchor) mod period < length`.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct RedemptionTerms {
    pub min_amount: U128,
    /// 0 means no maximum.
    pub max_amount: U128,
    pub fee_bps: u16,
    pub window_anchor_ms: u64,
    pub window_length_ms: u64,
    pub window_period_ms: u64,
    /// The issuer's time to accept a request.
    pub accept_within_ms: u64,
    /// The issuer's time to fulfil after accepting.
    pub settlement_days: u16,
}

/// The terms in force, with the hash a redeeming user must quote.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct TermsRecord {
    pub terms: RedemptionTerms,
    pub version: u64,
    pub terms_hash: String,
    pub set_by: AccountId,
    pub set_ms: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum RedemptionStatus {
    Requested,
    Accepted,
    Fulfilled,
    Rejected,
    Expired,
    Reclaimed,
}

/// Which deadline an issuer missed.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum Miss {
    Accept,
    Fulfil,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct Redemption {
    pub id: u64,
    pub user: AccountId,
    pub representation_id: String,
    pub issuer_id: String,
    pub amount: U128,
    pub fee_bps: u16,
    /// `ceil(amount * fee_bps / 10_000)`: what the issuer keeps off chain.
    pub fee_units: U128,
    pub net_units: U128,
    pub terms_hash: String,
    pub terms_version: u64,
    pub payout_instruction_hash: String,
    pub status: RedemptionStatus,
    pub created_ms: u64,
    pub accept_deadline_ms: u64,
    pub accepted_ms: Option<u64>,
    pub fulfil_deadline_ms: Option<u64>,
    pub resolved_ms: Option<u64>,
    pub fulfilment_evidence_hash: Option<String>,
    pub reject_reason: Option<String>,
    pub miss: Option<Miss>,
    pub settlement_days: u16,
    /// True while the token call of a fulfilment (burn) or a reclaim (return) is in flight.
    pub settling: bool,
}

/// Why `ft_on_transfer` refused a redemption; emitted in `redemption_refused`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [json])]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RedeemRefusal {
    UnknownToken,
    InvalidMsg,
    Paused,
    AssetNotRedeemable,
    TermsMissing,
    TermsChanged,
    BelowMin,
    AboveMax,
    WindowClosed,
    TooManyOpen,
}

/// Tokens in, burned and returned, per representation. All move only on confirmed token calls.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
#[near(serializers = [borsh])]
pub struct EscrowTotals {
    pub escrowed_in: u128,
    pub burned: u128,
    pub returned: u128,
}

/// `get_escrow_ledger`: `held = escrowed_in - burned - returned` and `open_amount`, the sum over
/// requests that still hold escrow, must agree.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [json])]
pub struct EscrowLedger {
    pub escrowed_in: U128,
    pub burned: U128,
    pub returned: U128,
    pub held: U128,
    pub open_amount: U128,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct IssuerReliability {
    pub issuer_id: String,
    pub requested: u64,
    pub accepted: u64,
    pub fulfilled: u64,
    pub rejected: u64,
    pub expired: u64,
    pub accept_misses: u64,
    pub fulfil_misses: u64,
    pub reclaimed: u64,
    pub accept_latency_ms_total: U128,
    pub settle_latency_ms_total: U128,
    pub last_miss_ms: Option<u64>,
    pub simulated: bool,
}
