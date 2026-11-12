//! Read views of corporate actions, multiplier schedules and the multipliers a relationship was
//! approved on (ADR 0017).

use crate::actions_types::{CorporateAction, MultiplierEpoch};
use crate::types::Ratio;
use crate::{Contract, ContractExt};
use near_sdk::near;

#[near]
impl Contract {
    /// Every corporate action of a canonical asset, oldest first.
    pub fn get_corporate_actions(&self, asset_id: String) -> Vec<CorporateAction> {
        self.actions_by_asset
            .get(&asset_id)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.corporate_actions.get(id).cloned())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// The multipliers `(a, b)` a relationship was last approved on, `a < b` as stored; the basis
    /// of the `epoch_mismatch` check.
    pub fn get_approved_multipliers(
        &self,
        representation_a_id: String,
        representation_b_id: String,
    ) -> Option<(Ratio, Ratio)> {
        let key = crate::compatibility::pair_key(&representation_a_id, &representation_b_id);
        self.approved_multipliers.get(&key).copied()
    }

    /// The multiplier schedule of a representation: genesis first, then one epoch per applied
    /// action.
    pub fn get_multiplier_epochs(&self, representation_id: String) -> Vec<MultiplierEpoch> {
        self.epochs
            .get(&representation_id)
            .cloned()
            .unwrap_or_default()
    }
}
