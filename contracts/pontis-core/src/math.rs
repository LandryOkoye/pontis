//! Conversion amount math (ADR 0001). Integer only: `gross = floor(in * ratio)`,
//! `fee = ceil(gross * fee_bps / 10_000)`, `net = gross - fee`. Rounding always favours the
//! protocol, so `net <= gross <= exact output`. Every product is checked; overflow yields `None`
//! and the conversion is rejected and refunded. Mirrored by `packages/quote-engine` (B10) and
//! pinned by the shared vectors in `test-vectors/quote-math.json`.

use crate::types::Ratio;

pub const BPS_DENOMINATOR: u128 = 10_000;
/// Hard cap on `protocol_fee_bps` (1%).
pub const MAX_FEE_BPS: u16 = 100;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Amounts {
    pub gross: u128,
    pub fee: u128,
    pub net: u128,
}

/// `floor(a * b / c)`, or `None` if `a * b` overflows or `c` is zero.
pub fn mul_div_floor(a: u128, b: u128, c: u128) -> Option<u128> {
    a.checked_mul(b)?.checked_div(c)
}

/// `ceil(a * b / c)`, or `None` if `a * b` overflows or `c` is zero.
pub fn mul_div_ceil(a: u128, b: u128, c: u128) -> Option<u128> {
    let product = a.checked_mul(b)?;
    let quotient = product.checked_div(c)?;
    Some(if product % c == 0 {
        quotient
    } else {
        quotient + 1
    })
}

/// Output of converting `amount_in` at `ratio` (output smallest units per input smallest unit)
/// with a protocol fee of `fee_bps`. Returns `None` on arithmetic overflow.
pub fn compute_amounts(amount_in: u128, ratio: Ratio, fee_bps: u16) -> Option<Amounts> {
    let gross = mul_div_floor(amount_in, ratio.num.0, ratio.den.0)?;
    let fee = mul_div_ceil(gross, u128::from(fee_bps), BPS_DENOMINATOR)?;
    Some(Amounts {
        gross,
        fee,
        net: gross - fee,
    })
}
