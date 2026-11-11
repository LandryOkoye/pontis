//! Resetting a tripped circuit breaker (ADR 0016 section 5) and reading its state.

use crate::breaker::{BreakerState, Evaluation};
use crate::compatibility::pair_key;
use crate::events::CoreEvent;
use crate::types::{check, RelationshipStatus, ReviewAction};
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{env, near};

#[near]
impl Contract {
    /// Compat approver. Re-enables a pair the breaker suspended. The caller must differ from the
    /// relationship's proposer and from the account that triggered the trip, and the guard must
    /// pass on the current prices: a deviation that is still there is refused.
    #[payable]
    pub fn reset_circuit_breaker(
        &mut self,
        representation_a_id: String,
        representation_b_id: String,
        rationale: String,
    ) {
        let by = self.assert_compat_approver();
        crate::types::require_text(&rationale, "rationale");
        let pair = pair_key(&representation_a_id, &representation_b_id);
        let mut state = self
            .breakers
            .get(&pair)
            .cloned()
            .unwrap_or_else(|| env::panic_str("no circuit breaker state for this pair"));
        check(state.tripped, "the circuit breaker is not tripped");
        let guard = self
            .guards
            .get(&pair)
            .cloned()
            .unwrap_or_else(|| env::panic_str("pair has no guard"));
        let rel = self
            .compatibilities
            .get(&pair)
            .unwrap_or_else(|| env::panic_str("relationship not found"));
        check(
            rel.status == RelationshipStatus::Suspended,
            "relationship is not suspended",
        );
        check(
            by != rel.proposed_by,
            "the proposer cannot reset the breaker",
        );
        check(
            state.breaker_actor.as_ref() != Some(&by),
            "the account that triggered the trip cannot reset it",
        );
        check(
            self.evaluate_pair(&pair, &guard) == Evaluation::Within,
            "guard still violated or prices unavailable",
        );
        let now = now_ms();
        let rel = self
            .compatibilities
            .get_mut(&pair)
            .unwrap_or_else(|| env::panic_str("relationship not found"));
        rel.classification = rel.last_approved_classification();
        rel.status = RelationshipStatus::Approved;
        rel.approved_by = Some(by.clone());
        rel.rationale = rationale;
        let version = rel.record(ReviewAction::Reapproved, &by, now);
        state.tripped = false;
        state.consecutive_violations = 0;
        self.breakers.insert(pair.clone(), state);
        CoreEvent::CircuitBreakerReset {
            id: pair,
            version,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    pub fn get_circuit_breaker(
        &self,
        representation_a_id: String,
        representation_b_id: String,
    ) -> Option<BreakerState> {
        self.breakers
            .get(&pair_key(&representation_a_id, &representation_b_id))
            .cloned()
    }
}
