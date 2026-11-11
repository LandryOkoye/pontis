//! NEP-297 events of the redemption lifecycle (ADR 0020 section 7). Same `pontis` standard as
//! `CoreEvent`; kept in its own enum so each file stays small.

use crate::redemption_types::{Miss, RedeemRefusal, RedemptionTerms};
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[near(event_json(standard = "pontis"))]
pub enum RedemptionEvent {
    #[event_version("1.0.0")]
    RedemptionTermsSet {
        representation_id: String,
        version: u64,
        terms_hash: String,
        terms: RedemptionTerms,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RedemptionRequested {
        id: u64,
        user: AccountId,
        representation_id: String,
        issuer_id: String,
        amount: U128,
        fee_bps: u16,
        fee_units: U128,
        terms_hash: String,
        terms_version: u64,
        payout_instruction_hash: String,
        accept_deadline_ms: u64,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RedemptionRefused {
        reason: RedeemRefusal,
        sender_id: AccountId,
        token: AccountId,
        amount: U128,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RedemptionAccepted {
        id: u64,
        accepted_ms: u64,
        fulfil_deadline_ms: u64,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RedemptionRejected {
        id: u64,
        reason: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RedemptionFulfilled {
        id: u64,
        evidence_hash: String,
        amount: U128,
        circulating_units: U128,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RedemptionFulfilFailed { id: u64, timestamp_ms: u64 },
    #[event_version("1.0.0")]
    RedemptionExpired {
        id: u64,
        miss: Miss,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RedemptionReclaimed {
        id: u64,
        user: AccountId,
        amount: U128,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    RedemptionReclaimFailed { id: u64, timestamp_ms: u64 },
}
