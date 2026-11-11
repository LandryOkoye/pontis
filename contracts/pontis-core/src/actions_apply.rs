//! Applying an approved corporate action to a representation (ADR 0017 section 2): the issuer's
//! wrapper takes the approved factor, the schedule gets a new epoch and every relationship of the
//! representation moves to a new version, which voids quotes signed before.

use crate::actions_events::ActionEvent;
use crate::actions_types::*;
use crate::epochs::{effective_at, is_exact_factor};
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{env, near, AccountId};

#[near]
impl Contract {
    /// Registrar. Appends the action's epoch to `representation_id` once the action is effective.
    /// With a `multiplier_change`, `new_multiplier` must equal the multiplier in force at
    /// `effective_ms` times that change exactly; without one it must be absent. When every live
    /// representation of the asset has applied, the action becomes `applied`.
    #[payable]
    pub fn apply_corporate_action(
        &mut self,
        action_id: String,
        representation_id: String,
        new_multiplier: Option<Ratio>,
    ) {
        let by = self.assert_registrar();
        let now = now_ms();
        let action = self
            .corporate_actions
            .get(&action_id)
            .unwrap_or_else(|| env::panic_str("corporate action not found"));
        check(
            action.status == ActionStatus::Approved,
            "only an approved action can be applied",
        );
        check(
            now >= action.effective_ms,
            "the action is not effective yet",
        );
        let rep = self
            .representations
            .get(&representation_id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        check(
            rep.canonical_asset_id == action.asset_id,
            "the representation belongs to another asset",
        );
        check(
            !action.applied_representations.contains(&representation_id),
            "the representation has already applied this action",
        );
        let epochs = self
            .epochs
            .get(&representation_id)
            .cloned()
            .unwrap_or_default();
        let epoch = match (action.multiplier_change, new_multiplier) {
            (Some(change), Some(proposed)) => {
                check(epochs.len() < MAX_EPOCHS, "too many multiplier epochs");
                check(
                    epochs
                        .last()
                        .is_some_and(|e| e.effective_ms < action.effective_ms),
                    "a later epoch is already scheduled",
                );
                let previous = effective_at(&epochs, action.effective_ms);
                check(
                    is_exact_factor(previous, change, proposed),
                    "new_multiplier must equal the previous multiplier times the approved change",
                );
                Some(MultiplierEpoch {
                    effective_ms: action.effective_ms,
                    multiplier: Ratio::normalised(proposed.num, proposed.den),
                    action_id: action_id.clone(),
                })
            }
            (Some(_), None) => env::panic_str("new_multiplier is required for this action"),
            (None, Some(_)) => env::panic_str("this action has no multiplier change"),
            (None, None) => None,
        };
        let asset_id = action.asset_id.clone();

        if let Some(epoch) = epoch {
            let mut epochs = epochs;
            epochs.push(epoch.clone());
            ActionEvent::MultiplierEpochAdded {
                representation_id: representation_id.clone(),
                action_id: action_id.clone(),
                effective_ms: epoch.effective_ms,
                multiplier: epoch.multiplier,
                epochs: epochs.len() as u32,
                by: by.clone(),
                timestamp_ms: now,
            }
            .emit();
            self.epochs.insert(representation_id.clone(), epochs);
            self.bump_relationships_of(&representation_id, ReviewAction::MultiplierEpoch, &by);
        }
        let action = self.action_mut(&action_id);
        action
            .applied_representations
            .push(representation_id.clone());
        let applied = action.applied_representations.clone();
        let complete = self.all_live_applied(&asset_id, &applied);
        ActionEvent::CorporateActionApplied {
            id: action_id.clone(),
            representation_id: Some(representation_id.clone()),
            complete: false,
            by: by.clone(),
            timestamp_ms: now,
        }
        .emit();
        if complete {
            self.finish_action(&action_id, &by, "every representation applied");
        }
    }

    /// Registrar. Marks an effective, approved action `applied` without a further wrapper
    /// application: the way to close an action with no multiplier change (a dividend or a symbol
    /// change is data and events only), or one whose remaining wrappers were deprecated.
    #[payable]
    pub fn settle_corporate_action(&mut self, action_id: String) {
        let by = self.assert_registrar();
        let action = self
            .corporate_actions
            .get(&action_id)
            .unwrap_or_else(|| env::panic_str("corporate action not found"));
        check(
            action.status == ActionStatus::Approved,
            "only an approved action can be settled",
        );
        check(
            now_ms() >= action.effective_ms,
            "the action is not effective yet",
        );
        check(
            action.multiplier_change.is_none()
                || self.all_live_applied(&action.asset_id, &action.applied_representations),
            "a wrapper has not applied this action",
        );
        self.finish_action(&action_id, &by, "settled");
    }

    /// Live representations are those not rejected or deprecated; the others cannot be asked to
    /// apply anything.
    pub(crate) fn all_live_applied(&self, asset_id: &str, applied: &[String]) -> bool {
        self.reps_by_asset
            .get(asset_id)
            .into_iter()
            .flatten()
            .filter(|id| {
                self.representations
                    .get(*id)
                    .is_some_and(|r| !matches!(r.status, Status::Rejected | Status::Deprecated))
            })
            .all(|id| applied.contains(id))
    }

    fn finish_action(&mut self, action_id: &str, by: &AccountId, note: &str) {
        let now = now_ms();
        let action = self.action_mut(action_id);
        action.status = ActionStatus::Applied;
        action.history.push(ActionHistoryEntry {
            status: ActionStatus::Applied,
            by: by.clone(),
            at_ms: now,
            note: note.to_string(),
        });
        let asset_id = action.asset_id.clone();
        self.set_open(&asset_id, action_id, false);
        ActionEvent::CorporateActionApplied {
            id: action_id.to_string(),
            representation_id: None,
            complete: true,
            by: by.clone(),
            timestamp_ms: now,
        }
        .emit();
    }

    /// Records a new version on every relationship the representation takes part in, so a quote
    /// signed under the old terms is refused with `COMPATIBILITY_CHANGED`.
    pub(crate) fn bump_relationships_of(
        &mut self,
        rep_id: &str,
        action: ReviewAction,
        by: &AccountId,
    ) {
        let now = now_ms();
        for key in self.rels_by_rep.get(rep_id).cloned().unwrap_or_default() {
            if let Some(rel) = self.compatibilities.get_mut(&key) {
                rel.record(action, by, now);
            }
        }
    }
}
