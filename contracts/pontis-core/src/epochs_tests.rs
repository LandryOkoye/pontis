//! The shared multiplier epoch vectors (`test-vectors/multiplier-epochs.json`), computed with
//! unbounded Python integers, reproduced here, plus the properties the vectors cannot state.

use crate::actions_types::MultiplierEpoch;
use crate::epochs::*;
use crate::types::Ratio;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Value};
use proptest::prelude::*;

fn vector() -> Value {
    serde_json::from_str(include_str!("../../../test-vectors/multiplier-epochs.json")).unwrap()
}

fn ratio(v: &Value) -> Ratio {
    let part = |k: &str| U128(v[k].as_str().unwrap().parse().unwrap());
    Ratio {
        num: part("num"),
        den: part("den"),
    }
}

fn r(num: u128, den: u128) -> Ratio {
    Ratio::normalised(U128(num), U128(den))
}

#[test]
fn the_effective_multiplier_matches_the_shared_vectors() {
    for case in vector()["lookup"].as_array().unwrap() {
        let epochs: Vec<MultiplierEpoch> = case["input"]["epochs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| MultiplierEpoch {
                effective_ms: e["effective_ms"].as_u64().unwrap(),
                multiplier: ratio(&e["multiplier"]),
                action_id: e["action_id"].as_str().unwrap().to_string(),
            })
            .collect();
        let at = case["input"]["at_ms"].as_u64().unwrap();
        assert_eq!(
            effective_at(&epochs, at),
            ratio(&case["expected"]),
            "{case}"
        );
    }
}

#[test]
fn the_exact_factor_rule_matches_the_shared_vectors() {
    for case in vector()["exact_factor"].as_array().unwrap() {
        let i = &case["input"];
        let got = is_exact_factor(
            ratio(&i["previous"]),
            ratio(&i["change"]),
            ratio(&i["proposed"]),
        );
        assert_eq!(got, case["expected"].as_bool().unwrap(), "{case}");
    }
}

#[test]
fn the_quotient_mismatch_matches_the_shared_vectors() {
    for case in vector()["mismatch"].as_array().unwrap() {
        let i = &case["input"];
        let got = quotient_mismatch(
            ratio(&i["a_now"]),
            ratio(&i["b_now"]),
            ratio(&i["a_approved"]),
            ratio(&i["b_approved"]),
        );
        assert_eq!(got, case["expected_mismatch"].as_bool().unwrap(), "{case}");
    }
}

#[test]
fn scaling_reduces_to_lowest_terms() {
    assert_eq!(scaled(r(1, 1_000_000), r(1, 2)), Some(r(1, 2_000_000)));
    assert_eq!(scaled(r(3, 7), r(7, 3)), Some(r(1, 1)));
    assert_eq!(scaled(r(u128::MAX, 1), r(2, 1)), None);
}

proptest! {
    #[test]
    fn applying_the_same_factor_to_both_sides_never_mismatches(
        a in 1u128..1_000_000, b in 1u128..1_000_000, n in 1u128..1_000, d in 1u128..1_000,
    ) {
        let (a, b, change) = (r(a, 1_000_003), r(b, 999_983), r(n, d));
        let (a2, b2) = (scaled(a, change).unwrap(), scaled(b, change).unwrap());
        prop_assert!(!quotient_mismatch(a2, b2, a, b));
        prop_assert!(is_exact_factor(a, change, a2));
    }

    #[test]
    fn a_one_sided_change_always_mismatches(
        a in 1u128..1_000_000, b in 1u128..1_000_000, n in 1u128..1_000, d in 1u128..1_000,
    ) {
        prop_assume!(n != d);
        let (a, b, change) = (r(a, 1_000_003), r(b, 999_983), r(n, d));
        prop_assert!(quotient_mismatch(scaled(a, change).unwrap(), b, a, b));
    }
}
