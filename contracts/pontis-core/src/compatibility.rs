//! Compatibility relationships (brief §6.5-6.7, ADR 0004).
//!
//! One relationship per unordered pair of representations, keyed `"{a}:{b}"` with `a < b`; its
//! ratio is stored in the `a to b` direction. Every recorded change appends to an append-only
//! history and bumps `version`. Only an approved `DIRECT_EQUIVALENT` relationship enables parity
//! conversion.

use crate::events::CoreEvent;
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{near, AccountId};

/// Orders a pair so `a < b`, inverting the `a to b` ratio when the arguments were swapped.
pub(crate) fn normalise_pair(a: &str, b: &str, ratio: Ratio) -> (String, String, Ratio) {
    if a <= b {
        (a.to_string(), b.to_string(), ratio)
    } else {
        (
            b.to_string(),
            a.to_string(),
            Ratio {
                num: ratio.den,
                den: ratio.num,
            },
        )
    }
}

pub(crate) fn pair_key(a: &str, b: &str) -> String {
    if a <= b {
        format!("{a}:{b}")
    } else {
        format!("{b}:{a}")
    }
}

#[near]
impl Contract {
    /// Proposes a relationship, or re-proposes one that was rejected. `ratio` is output smallest
    /// units of `representation_b_id` per smallest unit of `representation_a_id`; the contract
    /// stores the pair in sorted order and inverts the ratio if needed.
    #[payable]
    pub fn propose_compatibility(
        &mut self,
        representation_a_id: String,
        representation_b_id: String,
        classification: Classification,
        ratio: Ratio,
        scope: String,
        rationale: String,
    ) {
        let by = self.assert_compat_approver();
        check(
            representation_a_id != representation_b_id,
            "a relationship needs two different representations",
        );
        check(
            self.representations.contains_key(&representation_a_id)
                && self.representations.contains_key(&representation_b_id),
            "representation not found",
        );
        check(
            classification != Classification::Suspended,
            "SUSPENDED is set by suspension, not proposed",
        );
        require_text(&scope, "scope");
        require_text(&rationale, "rationale");
        let ratio = Ratio::normalised(ratio.num, ratio.den);
        let (a, b, ratio) = normalise_pair(&representation_a_id, &representation_b_id, ratio);
        let id = pair_key(&a, &b);

        let now = now_ms();
        let mut rel = match self.compatibilities.get(&id) {
            Some(existing) => {
                check(
                    existing.status == RelationshipStatus::Rejected,
                    "relationship already exists; only a rejected one can be re-proposed",
                );
                existing.clone()
            }
            None => Compatibility {
                id: id.clone(),
                representation_a_id: a,
                representation_b_id: b,
                classification,
                ratio,
                scope: scope.clone(),
                rationale: rationale.clone(),
                status: RelationshipStatus::Proposed,
                version: 0,
                proposed_by: by.clone(),
                approved_by: None,
                evidence: vec![],
                history: vec![],
                updated_at_ms: now,
            },
        };
        rel.classification = classification;
        rel.ratio = ratio;
        rel.scope = scope;
        rel.rationale = rationale;
        rel.status = RelationshipStatus::Proposed;
        rel.proposed_by = by.clone();
        rel.approved_by = None;
        let version = rel.record(ReviewAction::Proposed, &by, now);
        self.compatibilities.insert(id.clone(), rel);
        CoreEvent::CompatibilityProposed {
            id,
            version,
            classification,
            ratio,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    /// The relationship for a pair, in either argument order. `ratio` is in the direction
    /// `representation_a_id` to `representation_b_id` as stored (`a < b`).
    pub fn get_compatibility(
        &self,
        representation_a_id: String,
        representation_b_id: String,
    ) -> Option<Compatibility> {
        self.compatibilities
            .get(&pair_key(&representation_a_id, &representation_b_id))
            .cloned()
    }

    pub fn list_compatibilities(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<Compatibility> {
        crate::registry::page(self.compatibilities.values(), from_index, limit)
    }
}

impl Compatibility {
    /// Appends the current state to the history as the next version and returns that version.
    pub(crate) fn record(&mut self, action: ReviewAction, actor: &AccountId, now: u64) -> u64 {
        let version = self.history.len() as u64 + 1;
        self.version = version;
        self.updated_at_ms = now;
        self.history.push(CompatibilityVersion {
            version,
            action,
            classification: self.classification,
            status: self.status,
            ratio: self.ratio,
            scope: self.scope.clone(),
            rationale: self.rationale.clone(),
            actor: actor.clone(),
            timestamp_ms: now,
        });
        version
    }
}
