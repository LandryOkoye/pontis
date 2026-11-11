//! The circuit breaker (ADR 0016 section 5). It is evaluated when a price is submitted and when a
//! conversion is refused for price deviation. A trip suspends the relationship with the
//! `suspend_compatibility` semantics and records why; only a compat approver who is neither the
//! proposer nor the account that triggered the trip can reset it, and only while the guard passes.

use crate::compatibility::pair_key;
use crate::events::CoreEvent;
use crate::guard::RouteGuard;
use crate::guard_math::{deviation_bps, deviation_terms, exceeds};
use crate::types::{Classification, RelationshipStatus, ReviewAction};
use crate::{now_ms, Contract};
use near_sdk::{env, near, AccountId};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct BreakerState {
    pub consecutive_violations: u8,
    pub tripped: bool,
    pub trip_count: u32,
    pub last_trip_ms: u64,
    /// The predecessor of the call that tripped it.
    pub breaker_actor: Option<AccountId>,
    pub last_deviation_bps: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
pub enum TripReason {
    HardBound,
    ConsecutiveViolations,
}

/// What a fresh evaluation of a pair's guard found.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Evaluation {
    /// A price is missing, stale, in another currency or too large to compare: no verdict.
    NoVerdict,
    Within,
    Violated {
        deviation_bps: u32,
        hard: bool,
    },
}

impl Contract {
    /// Evaluates the guard of `pair` (in the stored `a -> b` direction) on the current prices.
    pub(crate) fn evaluate_pair(&self, pair: &str, guard: &RouteGuard) -> Evaluation {
        let Some(rel) = self.compatibilities.get(pair) else {
            return Evaluation::NoVerdict;
        };
        let now = now_ms();
        let price = |id: &str| {
            self.prices
                .get(id)
                .filter(|p| now.saturating_sub(p.as_of_ms) <= guard.max_price_age_ms)
        };
        let (Some(a), Some(b)) = (
            price(&rel.representation_a_id),
            price(&rel.representation_b_id),
        ) else {
            return Evaluation::NoVerdict;
        };
        let decimals = |id: &str| self.representations.get(id).map(|r| r.decimals);
        let (Some(da), Some(db)) = (
            decimals(&rel.representation_a_id),
            decimals(&rel.representation_b_id),
        ) else {
            return Evaluation::NoVerdict;
        };
        if a.currency != b.currency {
            return Evaluation::NoVerdict;
        }
        let Some((x, y)) = deviation_terms(rel.ratio, a.price.0, b.price.0, da, db) else {
            return Evaluation::NoVerdict;
        };
        match exceeds(x, y, guard.max_deviation_bps) {
            None => Evaluation::NoVerdict,
            Some(false) => Evaluation::Within,
            Some(true) => {
                let bps = deviation_bps(x, y).unwrap_or(u128::from(u32::MAX));
                let bps = u32::try_from(bps).unwrap_or(u32::MAX);
                Evaluation::Violated {
                    deviation_bps: bps,
                    hard: bps >= guard.hard_deviation_bps,
                }
            }
        }
    }

    /// After a price for `rep_id` is stored: evaluates every guarded approved relationship of it.
    pub(crate) fn evaluate_breakers_for(&mut self, rep_id: &str) {
        let pairs = self.pairs_by_rep.get(rep_id).cloned().unwrap_or_default();
        for pair in pairs {
            let Some(guard) = self.guards.get(&pair).cloned() else {
                continue;
            };
            let approved = self
                .compatibilities
                .get(&pair)
                .is_some_and(|r| r.status == RelationshipStatus::Approved);
            if !approved {
                continue;
            }
            match self.evaluate_pair(&pair, &guard) {
                Evaluation::NoVerdict => {}
                Evaluation::Within => {
                    let mut state = self.breakers.get(&pair).cloned().unwrap_or_default();
                    if state.consecutive_violations != 0 {
                        state.consecutive_violations = 0;
                        self.breakers.insert(pair, state);
                    }
                }
                Evaluation::Violated {
                    deviation_bps,
                    hard,
                } => self.count_violation(&pair, &guard, deviation_bps, hard),
            }
        }
    }

    /// A conversion on `from -> to` was refused for price deviation: counts as a violation.
    pub(crate) fn record_deviation_refusal(&mut self, from_id: &str, to_id: &str) {
        let pair = pair_key(from_id, to_id);
        let Some(guard) = self.guards.get(&pair).cloned() else {
            return;
        };
        let approved = self
            .compatibilities
            .get(&pair)
            .is_some_and(|r| r.status == RelationshipStatus::Approved);
        if !approved {
            return;
        }
        if let Evaluation::Violated {
            deviation_bps,
            hard,
        } = self.evaluate_pair(&pair, &guard)
        {
            self.count_violation(&pair, &guard, deviation_bps, hard);
        }
    }

    fn count_violation(&mut self, pair: &str, guard: &RouteGuard, deviation_bps: u32, hard: bool) {
        let mut state = self.breakers.get(pair).cloned().unwrap_or_default();
        state.consecutive_violations = state.consecutive_violations.saturating_add(1);
        state.last_deviation_bps = Some(deviation_bps);
        let reason = if hard {
            Some(TripReason::HardBound)
        } else if state.consecutive_violations >= guard.trip_after {
            Some(TripReason::ConsecutiveViolations)
        } else {
            None
        };
        match reason {
            None => {
                self.breakers.insert(pair.to_string(), state);
            }
            Some(reason) => self.trip(pair, state, deviation_bps, reason),
        }
    }

    fn trip(
        &mut self,
        pair: &str,
        mut state: BreakerState,
        deviation_bps: u32,
        reason: TripReason,
    ) {
        let now = now_ms();
        let actor = env::predecessor_account_id();
        state.tripped = true;
        state.trip_count = state.trip_count.saturating_add(1);
        state.last_trip_ms = now;
        state.breaker_actor = Some(actor.clone());
        let Some(rel) = self.compatibilities.get_mut(pair) else {
            return;
        };
        rel.status = RelationshipStatus::Suspended;
        rel.classification = Classification::Suspended;
        rel.rationale = format!("circuit breaker: price deviation {deviation_bps} bps");
        let version = rel.record(ReviewAction::Suspended, &actor, now);
        self.breakers.insert(pair.to_string(), state);
        CoreEvent::CircuitBreakerTripped {
            id: pair.to_string(),
            version,
            deviation_bps,
            reason,
            timestamp_ms: now,
        }
        .emit();
    }
}
