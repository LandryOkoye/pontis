//! The corporate action and lifecycle lines of `get_route_guards`. Each line is named after the
//! refusal it reports (`corporate_action_freeze`, ...) and `passed` means that refusal does not
//! apply. Lines are independent, so a failure does not hide a later one.

use crate::lifecycle_types::LifecycleStage;
use crate::route_guards::{check_line, GuardCheck};
use crate::Contract;

impl Contract {
    pub(crate) fn action_lifecycle_checks(&self, from_id: &str, to_id: &str) -> Vec<GuardCheck> {
        let ids = [from_id, to_id];
        let now = crate::now_ms();
        let assets: Vec<&str> = ids
            .iter()
            .filter_map(|id| self.representations.get(*id))
            .map(|r| r.canonical_asset_id.as_str())
            .collect();
        if assets.len() != 2 {
            return vec![];
        }
        let first = |find: &dyn Fn(&str) -> Option<String>, none: &str| {
            assets
                .iter()
                .find_map(|a| find(a))
                .map_or((true, none.to_string()), |id| (false, id))
        };
        let (frozen, freeze) = first(&|a| self.freeze_of(a, now), "no freeze window");
        let (pending, pend) = first(&|a| self.pending_of(a, now), "no unapplied action");
        let mut checks = vec![
            check_line("corporate_action_freeze", frozen, freeze),
            check_line("corporate_action_pending", pending, pend),
        ];
        let key = crate::compatibility::pair_key(from_id, to_id);
        if let Some(rel) = self.compatibilities.get(&key) {
            let mismatch = self.epoch_mismatch(rel, now);
            checks.push(check_line(
                "epoch_mismatch",
                !mismatch,
                if mismatch {
                    "live multiplier quotient differs from the approved one"
                } else {
                    "multiplier quotient matches the approved one"
                },
            ));
        }
        for id in ids {
            let life = self.lifecycle_of(id);
            checks.push(check_line(
                "not_convertible",
                !life.blocks_conversion(),
                format!(
                    "{id}: no_conversion={} bridge_only={}",
                    life.no_conversion, life.bridge_only
                ),
            ));
            checks.push(check_line(
                "lifecycle_blocked",
                life.stage == LifecycleStage::Active,
                format!("{id}: stage {:?}", life.stage),
            ));
            checks.push(check_line(
                "nav_window_closed",
                self.nav_window_ok(id, now),
                format!(
                    "{id}: {:?}",
                    self.nav_strikes.get(id).map(|s| (s.as_of_ms, s.cutoff_ms))
                ),
            ));
        }
        checks
    }
}
