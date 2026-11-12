//! Reserve attestation, policy and status types (ADR 0020 sections 3 to 5).
//!
//! The signed bytes are `b"pontis-reserve-v1" ++ borsh(ReservePayload)`; the contract rebuilds
//! them from the JSON fields (the pattern of `price.rs`) and `test-vectors/reserve-attestation.json`
//! pins the layout for Rust and an independent Python rebuild.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId, PublicKey};

pub const RESERVE_DOMAIN: &[u8] = b"pontis-reserve-v1";
pub const RESERVE_VERSION: u8 = 1;
/// History entries kept on chain per representation (a ring; the indexer keeps the rest).
pub const HISTORY_RING: u64 = 500;
/// A single attestation may not claim more than `2^100` units, which keeps every sum and
/// product of the status inside `u128`.
pub const MAX_RESERVED_UNITS: u128 = 1 << 100;
pub const MAX_TOLERANCE_BPS: u16 = 1_000;
pub const MIN_RESERVE_AGE_MS: u64 = 60_000;
pub const MAX_RESERVE_AGE_MS: u64 = 2_592_000_000;

/// What a custodian signs, as it arrives in JSON. `report_hash` is 64 lowercase hex characters.
#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct ReserveAttestation {
    pub version: u8,
    pub contract: AccountId,
    pub representation_id: String,
    pub custodian_id: String,
    pub reserved_units: U128,
    pub as_of_ms: u64,
    pub report_hash: String,
    pub report_uri: String,
    pub simulated: bool,
    pub source: String,
}

/// The Borsh layout that is signed. Field order is part of the contract.
#[derive(Clone, Debug)]
#[near(serializers = [borsh])]
struct ReservePayload {
    version: u8,
    contract: AccountId,
    representation_id: String,
    custodian_id: String,
    reserved_units: u128,
    as_of_ms: u64,
    report_hash: [u8; 32],
    report_uri: String,
    simulated: bool,
    source: String,
}

impl ReserveAttestation {
    /// The exact bytes a custodian signs; `None` when `report_hash` is not 64 lowercase hex.
    pub fn signing_message(&self) -> Option<Vec<u8>> {
        let payload = ReservePayload {
            version: self.version,
            contract: self.contract.clone(),
            representation_id: self.representation_id.clone(),
            custodian_id: self.custodian_id.clone(),
            reserved_units: self.reserved_units.0,
            as_of_ms: self.as_of_ms,
            report_hash: crate::hexa::decode32(&self.report_hash)?,
            report_uri: self.report_uri.clone(),
            simulated: self.simulated,
            source: self.source.clone(),
        };
        let mut message = RESERVE_DOMAIN.to_vec();
        message.extend(near_sdk::borsh::to_vec(&payload).ok()?);
        Some(message)
    }
}

/// A stored attestation: the latest per `(representation, custodian)` and each history entry.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct ReserveRecord {
    pub seq: u64,
    pub custodian_id: String,
    pub reserved_units: U128,
    pub as_of_ms: u64,
    pub submitted_ms: u64,
    pub report_hash: String,
    pub report_uri: String,
    pub simulated: bool,
    pub source: String,
    pub attester_key: PublicKey,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum ReserveAction {
    Warn,
    RestrictConversions,
    PauseMint,
}

/// Set per representation by the owner (`set_reserve_policy`).
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct ReservePolicy {
    pub tolerance_bps: u16,
    pub max_reserve_age_ms: u64,
    pub action: ReserveAction,
    /// The token supply the mint ledger starts from; 0 for a token minted only through the gate.
    pub baseline_supply: U128,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum ReserveState {
    Ok,
    Breached,
    Stale,
    NoAttestation,
    Unmonitored,
}

/// The last `ft_total_supply` result read by `refresh_supply`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct SupplyReading {
    pub units: U128,
    pub as_of_ms: u64,
}

/// What `get_supply` returns: the contract's three numbers and the circulating figure.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [json])]
pub struct SupplyView {
    pub ledger: U128,
    pub pending: U128,
    pub read: Option<SupplyReading>,
    pub circulating: U128,
}

/// `get_reserve_status`: computed on demand from the stored attestations, supply counters and
/// the policy (ADR 0020 section 5).
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [json])]
pub struct ReserveStatus {
    pub monitored: bool,
    pub state: ReserveState,
    pub action: Option<ReserveAction>,
    pub tolerance_bps: u16,
    pub max_reserve_age_ms: u64,
    pub attested_units: U128,
    pub limit_units: U128,
    pub circulating_units: U128,
    pub headroom_units: U128,
    pub ratio_bps: Option<u64>,
    pub oldest_as_of_ms: Option<u64>,
    pub age_ms: Option<u64>,
    pub supply_read_ms: Option<u64>,
    pub restricts_conversions: bool,
    pub mint_paused: bool,
    /// True when any contributing attestation is simulated.
    pub simulated: bool,
    pub sources: Vec<String>,
}
