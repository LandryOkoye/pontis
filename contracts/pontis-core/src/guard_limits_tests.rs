//! Skew, limits and guard validation (ADR 0016 sections 2 to 4).

use crate::guard::*;
use crate::guard_math::skew_bps;
use near_sdk::json_types::U128;
use proptest::prelude::*;

#[test]
fn skew_is_zero_when_full_and_the_maximum_when_empty() {
    assert_eq!(skew_bps(400, 1_000, 1_000), 0);
    assert_eq!(skew_bps(400, 1_000, 5_000), 0, "above the reference");
    assert_eq!(skew_bps(400, 1_000, 0), 400);
    assert_eq!(skew_bps(400, 0, 0), 0, "no reference, no skew");
    assert_eq!(skew_bps(0, 1_000, 0), 0);
}

#[test]
fn skew_is_quadratic_and_rounds_up() {
    // Half depleted: 400 * (1/2)^2 = 100.
    assert_eq!(skew_bps(400, 1_000, 500), 100);
    // A tenth depleted: 400 * 0.01 = 4.
    assert_eq!(skew_bps(400, 1_000, 900), 4);
    // Rounded up: 400 * (1/1000)^2 = 0.0004 -> 1.
    assert_eq!(skew_bps(400, 1_000_000, 999_000), 1);
}

#[test]
fn skew_is_exact_for_large_vaults_and_charges_the_maximum_when_the_numerator_overflows() {
    let big = 1u128 << 120;
    assert_eq!(skew_bps(400, big, big / 2), 100);
    // depletion^2 * 400 needs more than 256 bits: the cap is charged, the safe direction.
    assert_eq!(skew_bps(400, u128::MAX, u128::MAX / 2), 400);
}

fn guard() -> RouteGuard {
    RouteGuard {
        max_deviation_bps: 100,
        hard_deviation_bps: 500,
        trip_after: 3,
        max_price_age_ms: 900_000,
        stale_policy: StalePolicy::FailClosed,
        min_amount_in: U128(10),
        max_amount_in: U128(1_000),
        window_ms: 60_000,
        max_window_amount_in: U128(2_500),
        skew_max_bps: 100,
    }
}

#[test]
fn limits_check_the_minimum_the_maximum_and_the_window() {
    let g = guard();
    assert_eq!(g.check_limits(10, 0), Ok(()));
    assert_eq!(g.check_limits(9, 0), Err(LimitRefusal::BelowMin));
    assert_eq!(g.check_limits(1_000, 0), Ok(()));
    assert_eq!(g.check_limits(1_001, 0), Err(LimitRefusal::AboveMax));
    assert_eq!(
        g.check_limits(1_000, 1_500),
        Ok(()),
        "exactly at the window limit"
    );
    assert_eq!(
        g.check_limits(1_000, 1_501),
        Err(LimitRefusal::WindowExceeded)
    );
    assert_eq!(g.check_limits(1, u128::MAX), Err(LimitRefusal::BelowMin));
    let open = RouteGuard {
        min_amount_in: U128(0),
        max_amount_in: U128(0),
        window_ms: 0,
        max_window_amount_in: U128(0),
        ..g
    };
    assert_eq!(
        open.check_limits(u128::MAX, u128::MAX),
        Ok(()),
        "0 means none"
    );
}

#[test]
fn a_guard_is_validated_field_by_field() {
    guard().validate();
    let bad: Vec<(RouteGuard, &str)> = vec![
        (
            RouteGuard {
                max_deviation_bps: 0,
                ..guard()
            },
            "max_deviation_bps",
        ),
        (
            RouteGuard {
                max_deviation_bps: 10_001,
                ..guard()
            },
            "max_deviation_bps",
        ),
        (
            RouteGuard {
                hard_deviation_bps: 99,
                ..guard()
            },
            "hard_deviation_bps",
        ),
        (
            RouteGuard {
                hard_deviation_bps: 10_001,
                ..guard()
            },
            "hard_deviation_bps",
        ),
        (
            RouteGuard {
                trip_after: 0,
                ..guard()
            },
            "trip_after",
        ),
        (
            RouteGuard {
                trip_after: 11,
                ..guard()
            },
            "trip_after",
        ),
        (
            RouteGuard {
                max_price_age_ms: 59_999,
                ..guard()
            },
            "max_price_age_ms",
        ),
        (
            RouteGuard {
                max_price_age_ms: 7 * 86_400_000 + 1,
                ..guard()
            },
            "max_price_age_ms",
        ),
        (
            RouteGuard {
                skew_max_bps: 401,
                ..guard()
            },
            "skew_max_bps",
        ),
        (
            RouteGuard {
                min_amount_in: U128(2_000),
                ..guard()
            },
            "min_amount_in",
        ),
        (
            RouteGuard {
                window_ms: 0,
                ..guard()
            },
            "set together",
        ),
        (
            RouteGuard {
                max_window_amount_in: U128(0),
                ..guard()
            },
            "set together",
        ),
        (
            RouteGuard {
                stale_policy: StalePolicy::FailOpenWithWiderFee { extra_fee_bps: 0 },
                ..guard()
            },
            "extra_fee_bps",
        ),
        (
            RouteGuard {
                stale_policy: StalePolicy::FailOpenWithWiderFee { extra_fee_bps: 201 },
                ..guard()
            },
            "extra_fee_bps",
        ),
    ];
    for (g, expected) in bad {
        let r = std::panic::catch_unwind(|| g.validate());
        let msg = r
            .err()
            .and_then(|e| e.downcast_ref::<String>().cloned())
            .unwrap_or_default();
        assert!(msg.contains(expected), "{expected}: {msg}");
    }
}

proptest! {
    #[test]
    fn skew_never_exceeds_its_maximum_and_never_falls_as_the_vault_empties(
        reference in 1u128.., a in any::<u128>(), b in any::<u128>(), max in 0u16..=400,
    ) {
        let (lo, hi) = (a.min(b).min(reference), a.max(b).min(reference));
        let deeper = skew_bps(max, reference, lo);
        let shallower = skew_bps(max, reference, hi);
        prop_assert!(deeper <= max);
        prop_assert!(deeper >= shallower);
    }

    #[test]
    fn a_window_never_admits_more_than_its_limit(used in 0u128..10_000, amount in 0u128..10_000) {
        let g = guard();
        if g.window_ms > 0 && g.check_limits(amount.clamp(10, 1_000), used).is_ok() {
            prop_assert!(used + amount.clamp(10, 1_000) <= g.max_window_amount_in.0);
        }
    }
}
