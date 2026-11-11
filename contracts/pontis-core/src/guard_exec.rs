//! Guard evaluation against live state (ADR 0016): the price check of a route, the inventory
//! reference and the fee skew, the amount limits and the tumbling window. The types and the pure
//! arithmetic are in `guard.rs`.

use crate::compatibility::pair_key;
use crate::guard::{LimitRefusal, PriceOutcome, RouteGuard, StalePolicy, WindowState};
use crate::guard_math::{deviation_terms, exceeds, skew_bps};
use crate::price::PriceRecord;
use crate::route::RouteRefusal;
use crate::types::Ratio;
use crate::{now_ms, Contract};
use near_sdk::json_types::U128;

impl Contract {
    /// The price of `rep_id` if it exists, is not older than `max_age_ms` at `now`.
    fn fresh_price(&self, rep_id: &str, max_age_ms: u64, now: u64) -> Result<&PriceRecord, bool> {
        match self.prices.get(rep_id) {
            None => Err(true),
            Some(p) if now.saturating_sub(p.as_of_ms) > max_age_ms => Err(false),
            Some(p) => Ok(p),
        }
    }

    /// The price check for a route `from -> to` whose approved ratio in that direction is `ratio`.
    pub(crate) fn check_price_guard(
        &self,
        from_id: &str,
        to_id: &str,
        ratio: Ratio,
    ) -> Result<PriceOutcome, RouteRefusal> {
        let Some(guard) = self.guards.get(&pair_key(from_id, to_id)) else {
            return Ok(PriceOutcome::Ok);
        };
        let now = now_ms();
        let prices = (
            self.fresh_price(from_id, guard.max_price_age_ms, now),
            self.fresh_price(to_id, guard.max_price_age_ms, now),
        );
        let (from, to) = match prices {
            (Ok(f), Ok(t)) => (f, t),
            (a, b) => {
                let missing = matches!(a, Err(true)) || matches!(b, Err(true));
                return match guard.stale_policy {
                    StalePolicy::FailClosed if missing => Err(RouteRefusal::PriceMissing),
                    StalePolicy::FailClosed => Err(RouteRefusal::PriceStale),
                    StalePolicy::FailOpenWithWiderFee { extra_fee_bps } => {
                        Ok(PriceOutcome::Degraded { extra_fee_bps })
                    }
                };
            }
        };
        if from.currency != to.currency {
            return Err(RouteRefusal::PriceUnavailable);
        }
        let decimals = |id: &str| self.representations.get(id).map(|r| r.decimals);
        let (Some(d_from), Some(d_to)) = (decimals(from_id), decimals(to_id)) else {
            return Err(RouteRefusal::AssetNotFound);
        };
        let (x, y) = deviation_terms(ratio, from.price.0, to.price.0, d_from, d_to)
            .ok_or(RouteRefusal::PriceUnavailable)?;
        match exceeds(x, y, guard.max_deviation_bps) {
            Some(false) => Ok(PriceOutcome::Ok),
            Some(true) => Err(RouteRefusal::PriceDeviation),
            None => Err(RouteRefusal::PriceUnavailable),
        }
    }

    /// The reference inventory of a representation's vault (ADR 0016 section 3).
    pub(crate) fn inventory_reference_of(&self, rep_id: &str) -> u128 {
        self.inventory_ref.get(rep_id).copied().unwrap_or(0)
    }

    /// Raises the reference to the current inventory if the inventory is higher.
    pub(crate) fn raise_inventory_reference(&mut self, rep_id: &str) {
        let inventory = self.get_inventory(rep_id.to_string()).0;
        if inventory > self.inventory_reference_of(rep_id) {
            self.inventory_ref.insert(rep_id.to_string(), inventory);
        }
    }

    /// Lowers the reference to the current inventory if it is above it (after a withdrawal).
    pub(crate) fn clamp_inventory_reference(&mut self, rep_id: &str) {
        let inventory = self.get_inventory(rep_id.to_string()).0;
        if self.inventory_reference_of(rep_id) > inventory {
            self.inventory_ref.insert(rep_id.to_string(), inventory);
        }
    }

    pub(crate) fn window_key(pair: &str, from_id: &str) -> String {
        format!("{pair}|{from_id}")
    }

    /// The window state at `now`: a new window starts when the stored one has run its length.
    pub(crate) fn window_at(
        &self,
        pair: &str,
        from_id: &str,
        guard: &RouteGuard,
        now: u64,
    ) -> WindowState {
        let held = self
            .windows
            .get(&Self::window_key(pair, from_id))
            .copied()
            .filter(|w| now.saturating_sub(w.start_ms) < guard.window_ms);
        held.unwrap_or(WindowState {
            start_ms: now,
            used: U128(0),
        })
    }
}

impl Contract {
    /// The fee in basis points for converting `amount_in` on `from -> to`: the protocol fee, the
    /// extra fee of a tolerated stale price, and the skew for the output vault's depletion after
    /// paying out the amount that the base fee would give (ADR 0016 section 3).
    pub(crate) fn effective_fee_bps(
        &self,
        from_id: &str,
        to_id: &str,
        terms: &crate::route::RouteTerms,
        amount_in: u128,
    ) -> u16 {
        let base = self.fee_bps + terms.extra_fee_bps;
        let Some(guard) = self.guards.get(&pair_key(from_id, to_id)) else {
            return base;
        };
        if guard.skew_max_bps == 0 {
            return base;
        }
        let net = crate::math::compute_amounts(amount_in, terms.ratio, base).map_or(0, |a| a.net);
        let after = self.get_inventory(to_id.to_string()).0.saturating_sub(net);
        base + skew_bps(
            guard.skew_max_bps,
            self.inventory_reference_of(to_id),
            after,
        )
    }

    /// Per-transaction and window limits, as the reason `ft_on_transfer` reports.
    pub(crate) fn check_guard_limits(
        &self,
        from_id: &str,
        to_id: &str,
        amount_in: u128,
    ) -> Result<(), crate::types::RejectReason> {
        use crate::types::RejectReason;
        let pair = pair_key(from_id, to_id);
        let Some(guard) = self.guards.get(&pair) else {
            return Ok(());
        };
        let used = self.window_at(&pair, from_id, guard, now_ms()).used.0;
        guard.check_limits(amount_in, used).map_err(|r| match r {
            LimitRefusal::BelowMin => RejectReason::AmountBelowMin,
            LimitRefusal::AboveMax => RejectReason::AmountAboveMax,
            LimitRefusal::WindowExceeded => RejectReason::WindowLimitExceeded,
        })
    }

    /// Counts an accepted conversion against the window. A payout failure does not give it back.
    pub(crate) fn consume_window(&mut self, from_id: &str, to_id: &str, amount_in: u128) {
        let pair = pair_key(from_id, to_id);
        let Some(guard) = self.guards.get(&pair).cloned() else {
            return;
        };
        if guard.window_ms == 0 {
            return;
        }
        let mut window = self.window_at(&pair, from_id, &guard, now_ms());
        window.used = U128(window.used.0.saturating_add(amount_in));
        self.windows
            .insert(Self::window_key(&pair, from_id), window);
    }
}
