//! The computed route state of corporate actions (ADR 0017 section 3). Nothing here is stored:
//! freeze, pending and epoch agreement are all derived from the clock and the schedules at the
//! moment of the check, so a flag cannot be left on or forgotten.

use crate::actions_types::{ActionStatus, CorporateAction};
use crate::epochs::{effective_at, quotient_mismatch};
use crate::route::RouteRefusal;
use crate::types::{Compatibility, Ratio, RelationshipStatus};
use crate::Contract;

impl Contract {
    /// The approved actions of an asset. Proposed actions have no effect on routes.
    fn approved_actions<'a>(
        &'a self,
        asset_id: &str,
    ) -> impl Iterator<Item = &'a CorporateAction> + 'a {
        self.open_actions
            .get(asset_id)
            .into_iter()
            .flatten()
            .filter_map(|id| self.corporate_actions.get(id))
            .filter(|a| a.status == ActionStatus::Approved)
    }

    /// The ID of an approved action whose freeze window contains `now`.
    pub(crate) fn freeze_of(&self, asset_id: &str, now: u64) -> Option<String> {
        self.approved_actions(asset_id)
            .find(|a| a.freeze_from_ms <= now && now < a.freeze_until_ms)
            .map(|a| a.id.clone())
    }

    /// The ID of an approved, effective action with a multiplier change that some live
    /// representation of the asset has not applied: the issuers disagree.
    pub(crate) fn pending_of(&self, asset_id: &str, now: u64) -> Option<String> {
        self.approved_actions(asset_id)
            .find(|a| {
                a.multiplier_change.is_some()
                    && a.effective_ms <= now
                    && !self.all_live_applied(asset_id, &a.applied_representations)
            })
            .map(|a| a.id.clone())
    }

    /// The earliest freeze start after `now` of an approved action of either asset.
    pub(crate) fn next_freeze_ms(&self, assets: [&str; 2], now: u64) -> Option<u64> {
        assets
            .into_iter()
            .flat_map(|asset| self.approved_actions(asset))
            .map(|a| a.freeze_from_ms)
            .filter(|from| *from > now)
            .min()
    }

    /// The multiplier in force for a representation at `at_ms`.
    pub(crate) fn effective_multiplier(&self, rep_id: &str, at_ms: u64) -> Option<Ratio> {
        self.epochs
            .get(rep_id)
            .filter(|e| !e.is_empty())
            .map(|e| effective_at(e, at_ms))
    }

    /// The multipliers `(a, b)` an approved relationship was approved on. A relationship with no
    /// record (none exists after approval) is read at the registration multipliers.
    pub(crate) fn approved_multipliers_of(&self, rel: &Compatibility) -> Option<(Ratio, Ratio)> {
        self.approved_multipliers.get(&rel.id).copied().or_else(|| {
            let genesis = |id: &str| self.representations.get(id).map(|r| r.unit_multiplier);
            Some((
                genesis(&rel.representation_a_id)?,
                genesis(&rel.representation_b_id)?,
            ))
        })
    }

    /// Whether the live quotient of the pair's multipliers differs from the approved one.
    pub(crate) fn epoch_mismatch(&self, rel: &Compatibility, now: u64) -> bool {
        let live = (
            self.effective_multiplier(&rel.representation_a_id, now),
            self.effective_multiplier(&rel.representation_b_id, now),
            self.approved_multipliers_of(rel),
        );
        match live {
            (Some(a), Some(b), Some((a_ref, b_ref))) => quotient_mismatch(a, b, a_ref, b_ref),
            _ => true,
        }
    }

    /// `next_freeze_ms` of the `get_route` view; `None` when either representation is unknown.
    pub(crate) fn next_freeze_of_route(&self, from_id: &str, to_id: &str) -> Option<u64> {
        let asset = |id: &str| {
            self.representations
                .get(id)
                .map(|r| r.canonical_asset_id.as_str())
        };
        self.next_freeze_ms([asset(from_id)?, asset(to_id)?], crate::now_ms())
    }

    /// The freeze, pending and epoch checks of `check_route`, in that order.
    pub(crate) fn check_actions(&self, from_id: &str, to_id: &str) -> Result<(), RouteRefusal> {
        let now = crate::now_ms();
        let assets = [from_id, to_id].map(|id| {
            self.representations
                .get(id)
                .map(|r| r.canonical_asset_id.as_str())
        });
        let (Some(a), Some(b)) = (assets[0], assets[1]) else {
            return Err(RouteRefusal::AssetNotFound);
        };
        if self
            .freeze_of(a, now)
            .or_else(|| self.freeze_of(b, now))
            .is_some()
        {
            return Err(RouteRefusal::CorporateActionFreeze);
        }
        if self
            .pending_of(a, now)
            .or_else(|| self.pending_of(b, now))
            .is_some()
        {
            return Err(RouteRefusal::CorporateActionPending);
        }
        let key = crate::compatibility::pair_key(from_id, to_id);
        if let Some(rel) = self.compatibilities.get(&key) {
            if rel.status == RelationshipStatus::Approved && self.epoch_mismatch(rel, now) {
                return Err(RouteRefusal::EpochMismatch);
            }
        }
        Ok(())
    }
}
