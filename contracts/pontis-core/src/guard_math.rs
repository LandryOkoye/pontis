//! The pure guard arithmetic (ADR 0016 sections 2 and 3): the market deviation and the fee skew,
//! with 256-bit intermediates. Anything that does not fit is `None`, which callers refuse.

use crate::guard::{MAX_DECIMAL_GAP, MAX_PRICE};
use crate::types::Ratio;
use crate::wide::{pow10, U256};

/// The pair, as the two sides of the market comparison: `X = A * den` and `Y = num * B` where
/// `market = A / B` and the approved ratio is `num / den`, in output smallest units per input
/// smallest unit. The deviation is `|X - Y| / Y`.
pub fn deviation_terms(
    ratio: Ratio,
    price_from: u128,
    price_to: u128,
    decimals_from: u8,
    decimals_to: u8,
) -> Option<(U256, U256)> {
    if price_from == 0 || price_to == 0 || price_from > MAX_PRICE || price_to > MAX_PRICE {
        return None;
    }
    let gap = u32::from(decimals_from.abs_diff(decimals_to));
    if gap > MAX_DECIMAL_GAP {
        return None;
    }
    let scale = pow10(gap)?;
    // market = price_from * 10^d_to / (price_to * 10^d_from)
    let (a, b) = if decimals_to >= decimals_from {
        (U256::mul(price_from, scale), U256::from_u128(price_to))
    } else {
        (U256::from_u128(price_from), U256::mul(price_to, scale))
    };
    let x = a.checked_mul_u128(ratio.den.0)?;
    let y = b.checked_mul_u128(ratio.num.0)?;
    Some((x, y))
}

/// `|X - Y| * 10000 > max_bps * Y`, or `None` on overflow.
pub fn exceeds(x: U256, y: U256, max_bps: u32) -> Option<bool> {
    let lhs = x.abs_diff(y).checked_mul_u128(10_000)?;
    let rhs = y.checked_mul_u128(u128::from(max_bps))?;
    Some(lhs > rhs)
}

/// `floor(|X - Y| * 10000 / Y)`, saturated to `u128`, or `None` on overflow or `Y = 0`.
pub fn deviation_bps(x: U256, y: U256) -> Option<u128> {
    let scaled = x.abs_diff(y).checked_mul_u128(10_000)?;
    scaled.div_rem(y).map(|(q, _)| q.saturating_u128())
}

/// Extra fee in basis points for a depleted output vault: `ceil(skew_max * depletion^2 / ref^2)`
/// with `depletion = max(0, reference - inventory_after)`. Zero when the reference is zero.
pub fn skew_bps(skew_max_bps: u16, reference: u128, inventory_after: u128) -> u16 {
    let depletion = reference.saturating_sub(inventory_after);
    if reference == 0 || depletion == 0 || skew_max_bps == 0 {
        return 0;
    }
    let numerator = U256::mul(depletion, depletion).checked_mul_u128(u128::from(skew_max_bps));
    let denominator = U256::mul(reference, reference);
    match numerator.and_then(|n| n.div_ceil_u128(denominator)) {
        Some(v) => v.min(u128::from(skew_max_bps)) as u16,
        // The numerator overflowed 256 bits (a vault above 2^123 units): charge the maximum.
        None => skew_max_bps,
    }
}

/// The fee in basis points for converting `amount_in` at `ratio`: the protocol fee, the extra fee
/// of a tolerated stale price, and the skew for the vault's depletion after paying out what the
/// base fee would give (ADR 0016 section 3). A fee that cannot be computed charges the base.
pub fn fee_with_skew(
    base_fee_bps: u16,
    extra_fee_bps: u16,
    skew_max_bps: u16,
    reference: u128,
    inventory: u128,
    amount_in: u128,
    ratio: Ratio,
) -> u16 {
    let base = base_fee_bps + extra_fee_bps;
    if skew_max_bps == 0 {
        return base;
    }
    let net = crate::math::compute_amounts(amount_in, ratio, base).map_or(0, |a| a.net);
    base + skew_bps(skew_max_bps, reference, inventory.saturating_sub(net))
}
