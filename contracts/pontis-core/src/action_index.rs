//! The side indexes behind corporate actions: the representations of each asset, the multiplier
//! schedule that starts at registration, and the relationships each representation takes part in
//! (the set whose version an epoch or a flag change moves).

use crate::actions_types::MultiplierEpoch;
use crate::types::{Compatibility, Representation};
use crate::Contract;

impl Contract {
    /// Called once when a representation is registered: indexes it under its asset and writes
    /// the genesis epoch from its registration multiplier.
    pub(crate) fn index_representation(&mut self, rep: &Representation) {
        let mut reps = self
            .reps_by_asset
            .get(&rep.canonical_asset_id)
            .cloned()
            .unwrap_or_default();
        reps.push(rep.id.clone());
        self.reps_by_asset
            .insert(rep.canonical_asset_id.clone(), reps);
        self.epochs.insert(
            rep.id.clone(),
            vec![MultiplierEpoch {
                effective_ms: 0,
                multiplier: rep.unit_multiplier,
                action_id: "genesis".to_string(),
            }],
        );
    }

    /// Called when a relationship is created or re-proposed; idempotent.
    pub(crate) fn index_relationship(&mut self, rel: &Compatibility) {
        for rep in [&rel.representation_a_id, &rel.representation_b_id] {
            let mut keys = self.rels_by_rep.get(rep).cloned().unwrap_or_default();
            if !keys.contains(&rel.id) {
                keys.push(rel.id.clone());
                self.rels_by_rep.insert(rep.clone(), keys);
            }
        }
    }
}
