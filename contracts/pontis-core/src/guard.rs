//! Route guards (ADR 0016 sections 2 to 4): the market deviation check, stale-price policy, the
//! per-transaction and window limits, and the fee skew. A relationship with no guard behaves as it
//! did in the MVP. Guards live in a side map keyed by the pair, so `Compatibility` is unchanged.
//!
//! Everything is integer math with 256-bit intermediates. A value that does not fit is a refusal
//! (`PriceUnavailable`), never a pass.

use crate::compatibility::pair_key;
use crate::events::CoreEvent;
use crate::types::{check, ReviewAction};
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{env, near};

/// Prices above this are refused at submission so the guard arithmetic stays inside 256 bits.
pub const MAX_PRICE: u128 = u64::MAX as u128;
/// Largest difference between the two tokens' decimals the deviation check supports.
pub const MAX_DECIMAL_GAP: u32 = 18;
pub const MAX_SKEW_BPS: u16 = 400;
pub const MAX_EXTRA_FEE_BPS: u16 = 200;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum StalePolicy {
    FailClosed,
    FailOpenWithWiderFee { extra_fee_bps: u16 },
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct RouteGuard {
    pub max_deviation_bps: u32,
    pub hard_deviation_bps: u32,
    pub trip_after: u8,
    pub max_price_age_ms: u64,
    pub stale_policy: StalePolicy,
    /// Smallest input; 0 means none.
    pub min_amount_in: U128,
    /// Largest input per transaction; 0 means none.
    pub max_amount_in: U128,
    /// Tumbling window length and the largest total input per direction in it; 0 means none.
    pub window_ms: u64,
    pub max_window_amount_in: U128,
    pub skew_max_bps: u16,
}

impl RouteGuard {
    pub(crate) fn validate(&self) {
        check(
            (1..=10_000).contains(&self.max_deviation_bps),
            "max_deviation_bps must be 1 to 10000",
        );
        check(
            self.hard_deviation_bps >= self.max_deviation_bps && self.hard_deviation_bps <= 10_000,
            "hard_deviation_bps must be between max_deviation_bps and 10000",
        );
        check(
            (1..=10).contains(&self.trip_after),
            "trip_after must be 1 to 10",
        );
        check(
            (60_000..=7 * 86_400_000).contains(&self.max_price_age_ms),
            "max_price_age_ms must be 1 minute to 7 days",
        );
        if let StalePolicy::FailOpenWithWiderFee { extra_fee_bps } = self.stale_policy {
            check(
                (1..=MAX_EXTRA_FEE_BPS).contains(&extra_fee_bps),
                "extra_fee_bps must be 1 to 200",
            );
        }
        check(
            self.skew_max_bps <= MAX_SKEW_BPS,
            "skew_max_bps exceeds 400",
        );
        if self.max_amount_in.0 > 0 {
            check(
                self.min_amount_in.0 <= self.max_amount_in.0,
                "min_amount_in exceeds max_amount_in",
            );
        }
        check(
            (self.window_ms == 0) == (self.max_window_amount_in.0 == 0),
            "window_ms and max_window_amount_in are set together or not at all",
        );
        if self.window_ms > 0 {
            check(
                self.window_ms <= 30 * 86_400_000,
                "window_ms exceeds 30 days",
            );
        }
    }
}

/// The amount used in one tumbling window.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct WindowState {
    pub start_ms: u64,
    pub used: U128,
}

/// How a pair's price check ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PriceOutcome {
    /// No guard, or the guard passed on fresh prices.
    Ok,
    /// A price was stale or missing under `fail_open_with_wider_fee`: convert with `extra_fee_bps`.
    Degraded { extra_fee_bps: u16 },
}

/// An amount-dependent refusal from the guard, before the vault is touched.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LimitRefusal {
    BelowMin,
    AboveMax,
    WindowExceeded,
}

impl RouteGuard {
    pub fn check_limits(&self, amount_in: u128, window_used: u128) -> Result<(), LimitRefusal> {
        if self.min_amount_in.0 > 0 && amount_in < self.min_amount_in.0 {
            return Err(LimitRefusal::BelowMin);
        }
        if self.max_amount_in.0 > 0 && amount_in > self.max_amount_in.0 {
            return Err(LimitRefusal::AboveMax);
        }
        if self.window_ms > 0 {
            match window_used.checked_add(amount_in) {
                Some(total) if total <= self.max_window_amount_in.0 => {}
                _ => return Err(LimitRefusal::WindowExceeded),
            }
        }
        Ok(())
    }
}

#[near]
impl Contract {
    /// Compat approver. Sets or replaces the guard of an existing relationship. Bumps the
    /// relationship's version so quotes signed under the old terms are refused.
    #[payable]
    pub fn set_route_guard(
        &mut self,
        representation_a_id: String,
        representation_b_id: String,
        guard: RouteGuard,
    ) {
        let by = self.assert_compat_approver();
        guard.validate();
        let id = pair_key(&representation_a_id, &representation_b_id);
        let rel = self
            .compatibilities
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("relationship not found"));
        check(
            rel.status != crate::types::RelationshipStatus::Rejected,
            "a rejected relationship cannot take a guard",
        );
        let (a, b) = (
            rel.representation_a_id.clone(),
            rel.representation_b_id.clone(),
        );
        let now = now_ms();
        let version = rel.record(ReviewAction::GuardSet, &by, now);
        for rep in [a, b] {
            let mut pairs = self.pairs_by_rep.get(&rep).cloned().unwrap_or_default();
            if !pairs.contains(&id) {
                pairs.push(id.clone());
                self.pairs_by_rep.insert(rep, pairs);
            }
        }
        self.guards.insert(id.clone(), guard.clone());
        CoreEvent::RouteGuardSet {
            id,
            version,
            guard,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    /// Owner only. Sets the reference inventory of a vault, the denominator of the fee skew.
    #[payable]
    pub fn set_inventory_reference(&mut self, representation_id: String, reference: U128) {
        self.assert_owner();
        check(
            self.representations.contains_key(&representation_id),
            "representation not found",
        );
        self.inventory_ref
            .insert(representation_id.clone(), reference.0);
        CoreEvent::InventoryReferenceSet {
            representation_id,
            reference,
            by: env::predecessor_account_id(),
        }
        .emit();
    }

    pub fn get_route_guard(
        &self,
        representation_a_id: String,
        representation_b_id: String,
    ) -> Option<RouteGuard> {
        self.guards
            .get(&pair_key(&representation_a_id, &representation_b_id))
            .cloned()
    }

    pub fn get_inventory_reference(&self, representation_id: String) -> U128 {
        U128(self.inventory_reference_of(&representation_id))
    }
}
