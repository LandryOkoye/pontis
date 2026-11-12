//! Multiplier epoch arithmetic (ADR 0017 section 2): the effective multiplier at a time, the
//! exact-factor rule and the quotient comparison behind `epoch_mismatch`. Pure; the shared vector
//! `test-vectors/multiplier-epochs.json` pins it.
//!
//! Every product is taken on the unreduced parts with checked `u128` arithmetic. An overflow
//! refuses: an apply that cannot be verified is not accepted, and a quotient that cannot be
//! compared counts as a mismatch.

use crate::actions_types::MultiplierEpoch;
use crate::types::Ratio;
use near_sdk::env;

/// The multiplier of the last epoch with `effective_ms <= at_ms`. The schedule always starts at
/// `effective_ms = 0`.
pub fn effective_at(epochs: &[MultiplierEpoch], at_ms: u64) -> Ratio {
    epochs
        .iter()
        .rev()
        .find(|e| e.effective_ms <= at_ms)
        .map(|e| e.multiplier)
        .unwrap_or_else(|| env::panic_str("multiplier schedule has no genesis epoch"))
}

/// `previous * change` in lowest terms, or `None` on overflow.
pub fn scaled(previous: Ratio, change: Ratio) -> Option<Ratio> {
    let num = previous.num.0.checked_mul(change.num.0)?;
    let den = previous.den.0.checked_mul(change.den.0)?;
    Some(Ratio::normalised(num.into(), den.into()))
}

/// The exact-factor rule: the issuer must apply exactly the approved factor.
pub fn is_exact_factor(previous: Ratio, change: Ratio, proposed: Ratio) -> bool {
    scaled(previous, change) == Some(Ratio::normalised(proposed.num, proposed.den))
}

/// Whether the live quotient `a_now / b_now` differs from the approved `a_ref / b_ref`.
/// An overflow while forming either quotient counts as a mismatch.
pub fn quotient_mismatch(a_now: Ratio, b_now: Ratio, a_ref: Ratio, b_ref: Ratio) -> bool {
    match (a_now.checked_div(b_now), a_ref.checked_div(b_ref)) {
        (Some(live), Some(approved)) => live != approved,
        _ => true,
    }
}
