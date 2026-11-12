//! The lifecycle checks of `check_route` (ADR 0018 section 3): `not_convertible`,
//! `lifecycle_blocked`, `nav_window_closed`. A representation with no lifecycle record is a
//! fungible asset in stage `active`, which passes all three.

use crate::lifecycle_types::{AssetKind, LifecycleStage};
use crate::route::RouteRefusal;
use crate::Contract;

impl Contract {
    /// Whether the NAV window of `rep_id` is open at `now`. Always true for a non-NAV asset.
    pub(crate) fn nav_window_ok(&self, rep_id: &str, now: u64) -> bool {
        self.lifecycle_of(rep_id).kind != AssetKind::NavFund
            || self
                .nav_strikes
                .get(rep_id)
                .is_some_and(|s| s.window_open(now))
    }

    /// The three checks, each across both representations, in the order of the ADR.
    pub(crate) fn check_lifecycle(&self, from_id: &str, to_id: &str) -> Result<(), RouteRefusal> {
        let ids = [from_id, to_id];
        if ids
            .iter()
            .any(|id| self.lifecycle_of(id).blocks_conversion())
        {
            return Err(RouteRefusal::NotConvertible);
        }
        if ids
            .iter()
            .any(|id| self.lifecycle_of(id).stage != LifecycleStage::Active)
        {
            return Err(RouteRefusal::LifecycleBlocked);
        }
        let now = crate::now_ms();
        if ids.iter().any(|id| !self.nav_window_ok(id, now)) {
            return Err(RouteRefusal::NavWindowClosed);
        }
        Ok(())
    }
}
