//! The reserve invariant, computed on demand (ADR 0020 section 5):
//! `circulating <= attested * (1 + tolerance_bps / 10_000)`, with a staleness limit and an action.
//! Nothing off chain writes the status; the route gate recomputes it from stored attestations,
//! the supply counters and the block time, so it needs no other contract mid-transaction.

use crate::custody_events::CustodyEvent;
use crate::custody_types::CustodianStatus;
use crate::reserve_types::*;
use crate::route::RouteRefusal;
use crate::route_guards::{check_line, GuardCheck};
use crate::types::check;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, near};

impl Contract {
    /// The latest attestation of each active custodian linked to the representation.
    pub(crate) fn contributing_reserves(&self, rep_id: &str) -> Vec<ReserveRecord> {
        let Some(link) = self.custody_links.get(rep_id) else {
            return Vec::new();
        };
        link.custodian_ids
            .iter()
            .filter(|id| {
                self.custodians
                    .get(*id)
                    .is_some_and(|c| c.status == CustodianStatus::Active)
            })
            .filter_map(|id| self.reserve_latest.get(&format!("{rep_id}|{id}")))
            .cloned()
            .collect()
    }

    /// `max(ledger + pending, read)`; `None` on overflow, which callers treat as a breach.
    pub(crate) fn circulating_of(&self, rep_id: &str) -> Option<u128> {
        let ledger = self.supply_ledger.get(rep_id).copied().unwrap_or(0);
        let pending = self.pending_mint.get(rep_id).copied().unwrap_or(0);
        let counted = ledger.checked_add(pending)?;
        let read = self.supply_read.get(rep_id).map_or(0, |r| r.units.0);
        Some(counted.max(read))
    }

    pub(crate) fn compute_reserve_status(&self, rep_id: &str, now: u64) -> ReserveStatus {
        let Some(policy) = self.reserve_policies.get(rep_id) else {
            return unmonitored();
        };
        let records = self.contributing_reserves(rep_id);
        let attested: u128 = records.iter().map(|r| r.reserved_units.0).sum();
        // At most 4 attestations of at most 2^100 each: no overflow, and `* 10_000` fits u128.
        let limit = attested + attested * u128::from(policy.tolerance_bps) / 10_000;
        let circulating = self.circulating_of(rep_id);
        let oldest = records.iter().map(|r| r.as_of_ms).min();
        let age_ms = oldest.map(|t| now.saturating_sub(t));
        let breached = circulating.is_none_or(|c| c > limit);
        let state = if records.is_empty() {
            ReserveState::NoAttestation
        } else if breached {
            ReserveState::Breached
        } else if age_ms.is_some_and(|a| a > policy.max_reserve_age_ms) {
            ReserveState::Stale
        } else {
            ReserveState::Ok
        };
        let c = circulating.unwrap_or(u128::MAX);
        let flagged = state != ReserveState::Ok;
        let mut sources: Vec<String> = records.iter().map(|r| r.source.clone()).collect();
        sources.sort();
        sources.dedup();
        ReserveStatus {
            monitored: true,
            state,
            action: Some(policy.action),
            tolerance_bps: policy.tolerance_bps,
            max_reserve_age_ms: policy.max_reserve_age_ms,
            attested_units: U128(attested),
            limit_units: U128(limit),
            circulating_units: U128(c),
            headroom_units: U128(attested.saturating_sub(c)),
            ratio_bps: (c > 0)
                .then(|| u64::try_from(attested.saturating_mul(10_000) / c).unwrap_or(u64::MAX)),
            oldest_as_of_ms: oldest,
            age_ms,
            supply_read_ms: self.supply_read.get(rep_id).map(|r| r.as_of_ms),
            restricts_conversions: flagged && policy.action != ReserveAction::Warn,
            mint_paused: flagged && policy.action == ReserveAction::PauseMint,
            simulated: records.iter().any(|r| r.simulated),
            sources,
        }
    }

    /// Refuses a route when either leg is monitored with an action above `warn` and its reserves
    /// are breached (`reserve_restricted`) or stale or missing (`reserve_stale`).
    pub(crate) fn check_reserves(&self, from_id: &str, to_id: &str) -> Result<(), RouteRefusal> {
        let now = now_ms();
        for id in [from_id, to_id] {
            let status = self.compute_reserve_status(id, now);
            if !status.restricts_conversions {
                continue;
            }
            return Err(if status.state == ReserveState::Breached {
                RouteRefusal::ReserveRestricted
            } else {
                RouteRefusal::ReserveStale
            });
        }
        Ok(())
    }

    /// One `reserves` line of `get_route_guards` per monitored leg.
    pub(crate) fn reserve_guard_checks(&self, from_id: &str, to_id: &str) -> Vec<GuardCheck> {
        let now = now_ms();
        [from_id, to_id]
            .into_iter()
            .filter_map(|id| {
                let s = self.compute_reserve_status(id, now);
                let ratio = s.ratio_bps.map_or("n/a".to_string(), |r| r.to_string());
                s.monitored.then(|| {
                    check_line(
                        "reserves",
                        !s.restricts_conversions,
                        format!("{id}: {:?}, ratio {ratio} bps", s.state),
                    )
                })
            })
            .collect()
    }

    /// Stores the state and emits `reserve_status_changed` when it differs from the last one.
    pub(crate) fn refresh_reserve_state(&mut self, rep_id: &str) {
        let now = now_ms();
        let status = self.compute_reserve_status(rep_id, now);
        let from = self
            .reserve_state
            .get(rep_id)
            .copied()
            .unwrap_or(ReserveState::Unmonitored);
        if from == status.state {
            return;
        }
        self.reserve_state.insert(rep_id.to_string(), status.state);
        CustodyEvent::ReserveStatusChanged {
            representation_id: rep_id.to_string(),
            from_state: from,
            to_state: status.state,
            action: status.action,
            attested_units: status.attested_units,
            circulating_units: status.circulating_units,
            ratio_bps: status.ratio_bps,
            timestamp_ms: now,
        }
        .emit();
    }
}

fn unmonitored() -> ReserveStatus {
    ReserveStatus {
        monitored: false,
        state: ReserveState::Unmonitored,
        action: None,
        tolerance_bps: 0,
        max_reserve_age_ms: 0,
        attested_units: U128(0),
        limit_units: U128(0),
        circulating_units: U128(0),
        headroom_units: U128(0),
        ratio_bps: None,
        oldest_as_of_ms: None,
        age_ms: None,
        supply_read_ms: None,
        restricts_conversions: false,
        mint_paused: false,
        simulated: false,
        sources: Vec::new(),
    }
}

#[near]
impl Contract {
    pub fn get_reserve_status(&self, representation_id: String) -> ReserveStatus {
        self.compute_reserve_status(&representation_id, now_ms())
    }

    /// Anyone may call (1 yocto, not blocked by the pause). Recomputes the status and emits
    /// `reserve_status_changed` if it moved, which the clock alone can cause (staleness).
    #[payable]
    pub fn evaluate_reserve(&mut self, representation_id: String) {
        assert_one_yocto();
        check(
            self.representations.contains_key(&representation_id),
            "representation not found",
        );
        self.refresh_reserve_state(&representation_id);
    }
}
