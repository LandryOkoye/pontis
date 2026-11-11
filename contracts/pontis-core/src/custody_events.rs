//! NEP-297 events of the custody registry, reserve attestations and the gated mint (ADR 0020
//! sections 2 to 6). Same `pontis` standard as `CoreEvent`; kept in its own enum so each file
//! stays small.

use crate::custody_types::{CustodianStatus, CustodyStructure};
use crate::reserve_types::{ReserveAction, ReservePolicy, ReserveState};
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[near(event_json(standard = "pontis"))]
pub enum CustodyEvent {
    #[event_version("1.0.0")]
    CustodianRegistered {
        id: String,
        attester_key: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CustodianStatusChanged {
        id: String,
        from: CustodianStatus,
        to: CustodianStatus,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CustodianKeySet {
        id: String,
        attester_key: String,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    CustodyLinked {
        representation_id: String,
        structure: CustodyStructure,
        custodian_ids: Vec<String>,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    ReservePolicySet {
        representation_id: String,
        policy: ReservePolicy,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    ReserveAttested {
        representation_id: String,
        custodian_id: String,
        reserved_units: U128,
        as_of_ms: u64,
        report_hash: String,
        report_uri: String,
        simulated: bool,
        source: String,
        attester_key: String,
        seq: u64,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    ReserveSupplyRead {
        representation_id: String,
        supply: U128,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    ReserveStatusChanged {
        representation_id: String,
        from_state: ReserveState,
        to_state: ReserveState,
        action: Option<ReserveAction>,
        attested_units: U128,
        circulating_units: U128,
        ratio_bps: Option<u64>,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    MintRequested {
        id: u64,
        representation_id: String,
        recipient: AccountId,
        amount: U128,
        reference: String,
        requested_by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    MintCompleted {
        id: u64,
        representation_id: String,
        recipient: AccountId,
        amount: U128,
        circulating_units: U128,
        headroom_units: U128,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    MintFailed {
        id: u64,
        representation_id: String,
        reason: String,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    MintCancelled {
        id: u64,
        by: AccountId,
        timestamp_ms: u64,
    },
}
