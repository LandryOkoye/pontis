//! Pure guard arithmetic: deviation, skew and limits (ADR 0016 sections 2 to 4).

use crate::guard::MAX_PRICE;
use crate::guard_math::*;
use crate::types::Ratio;
use crate::wide::U256;
use near_sdk::json_types::U128;
use proptest::prelude::*;

fn ratio(num: u128, den: u128) -> Ratio {
    Ratio::normalised(U128(num), U128(den))
}

/// Deviation in bps for the demo pair: 6-decimal A, 8-decimal B, approved ratio 1000/1.
fn demo_deviation(price_a: u128, price_b: u128) -> u128 {
    let (x, y) = deviation_terms(ratio(1000, 1), price_a, price_b, 6, 8).unwrap();
    deviation_bps(x, y).unwrap()
}

const E8: u128 = 100_000_000;

#[test]
fn a_market_that_agrees_with_parity_has_zero_deviation() {
    // 1 A token = 10 B tokens: 100 USD against 10 USD.
    assert_eq!(demo_deviation(100 * E8, 10 * E8), 0);
}

#[test]
fn deviation_is_measured_against_the_approved_ratio_in_basis_points() {
    // Market 100 / 10.5 = 9.5238 B per A against 10: 4.76% below parity.
    assert_eq!(demo_deviation(100 * E8, 1_050 * E8 / 100), 476);
    // Market 100 / 9.5 = 10.526 B per A: 5.26% above parity. Both directions are measured.
    assert_eq!(demo_deviation(100 * E8, 95 * E8 / 10), 526);
}

#[test]
fn the_threshold_is_strict() {
    let (x, y) = deviation_terms(ratio(1000, 1), 100 * E8, 1_050 * E8 / 100, 6, 8).unwrap();
    // The exact deviation is 476.19 bps: 476 passes the floor but the true value exceeds 476.
    assert_eq!(exceeds(x, y, 476), Some(true));
    assert_eq!(exceeds(x, y, 477), Some(false));
}

#[test]
fn unusable_prices_and_gaps_give_no_comparison() {
    let r = ratio(1000, 1);
    assert!(deviation_terms(r, 0, E8, 6, 8).is_none());
    assert!(deviation_terms(r, E8, 0, 6, 8).is_none());
    assert!(deviation_terms(r, MAX_PRICE + 1, E8, 6, 8).is_none());
    assert!(
        deviation_terms(r, E8, E8, 0, 19).is_none(),
        "decimal gap above 18"
    );
    assert!(deviation_terms(r, E8, E8, 0, 18).is_some());
}

#[test]
fn a_ratio_too_large_for_256_bits_is_refused_not_passed() {
    let huge = Ratio {
        num: U128(u128::MAX),
        den: U128(1),
    };
    let terms = deviation_terms(huge, MAX_PRICE, MAX_PRICE, 0, 18);
    match terms {
        None => {}
        Some((x, y)) => assert!(exceeds(x, y, 100).is_none() || exceeds(x, y, 100) == Some(true)),
    }
}

proptest! {
    /// Where the products fit in u128 the 256-bit comparison agrees with plain u128 arithmetic.
    #[test]
    fn exceeds_matches_a_u128_reference(
        pf in 1u128..1_000_000_000_000, pt in 1u128..1_000_000_000_000,
        num in 1u128..1_000_000, den in 1u128..1_000_000,
        max in 1u32..10_000,
    ) {
        let r = ratio(num, den);
        let (x, y) = deviation_terms(r, pf, pt, 8, 8).unwrap();
        // A = pf, B = pt at equal decimals; X = pf * den, Y = num * pt (parts of the reduced ratio).
        let (rn, rd) = (r.num.0, r.den.0);
        let (xr, yr) = (pf * rd, rn * pt);
        let reference = xr.abs_diff(yr) * 10_000 > u128::from(max) * yr;
        prop_assert_eq!(exceeds(x, y, max), Some(reference));
        prop_assert_eq!(deviation_bps(x, y), Some(xr.abs_diff(yr) * 10_000 / yr));
    }

    #[test]
    fn deviation_is_zero_exactly_at_parity(p in 1u128..1_000_000_000, n in 1u128..1_000_000) {
        // Same token twice with ratio 1:1.
        let (x, y) = deviation_terms(ratio(1, 1), p * n, p * n, 6, 6).unwrap();
        prop_assert_eq!(deviation_bps(x, y), Some(0));
        prop_assert_eq!(exceeds(x, y, 1), Some(false));
    }

    #[test]
    fn wide_products_survive_the_deviation_terms(
        pf in 1u128..=u128::from(u64::MAX), pt in 1u128..=u128::from(u64::MAX),
        num in 1u128.., den in 1u128..,
    ) {
        if let Some((x, y)) = deviation_terms(ratio(num, den), pf, pt, 6, 8) {
            // Whatever comes back is comparable; None means refused, never a silent pass.
            if let Some(verdict) = exceeds(x, y, 100) {
                prop_assert_eq!(verdict, x.abs_diff(y).checked_mul_u128(10_000).unwrap() > y.checked_mul_u128(100).unwrap());
            }
            let _ = U256::ZERO;
        }
    }
}
