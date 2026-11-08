use crate::math::*;
use crate::types::Ratio;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Value};
use proptest::prelude::*;

fn ratio(num: u128, den: u128) -> Ratio {
    Ratio {
        num: U128(num),
        den: U128(den),
    }
}

fn n(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

#[test]
fn shared_vectors_match() {
    let doc: Value = serde_json::from_str(include_str!("../../../test-vectors/quote-math.json"))
        .expect("vector file parses");
    let cases = doc["cases"].as_array().unwrap();
    assert!(cases.len() >= 10);
    for case in cases {
        let r = ratio(n(&case["ratio"]["num"]), n(&case["ratio"]["den"]));
        let got = compute_amounts(
            n(&case["amount_in"]),
            r,
            case["fee_bps"].as_u64().unwrap() as u16,
        );
        let want = match &case["expected"] {
            Value::Null => None,
            e => Some(Amounts {
                gross: n(&e["gross"]),
                fee: n(&e["fee"]),
                net: n(&e["net"]),
            }),
        };
        assert_eq!(got, want, "vector: {}", case["name"]);
    }
}

#[test]
fn zero_divisor_is_refused_rather_than_panicking() {
    assert_eq!(mul_div_floor(1, 1, 0), None);
    assert_eq!(mul_div_ceil(1, 1, 0), None);
}

proptest! {
    /// Bounds keep every product inside u128 so the properties are checked exactly.
    #[test]
    fn output_never_exceeds_the_approved_ratio_after_fees(
        amount in 0u128..(1 << 60),
        num in 1u128..(1 << 30),
        den in 1u128..(1 << 30),
        bps in 0u16..=MAX_FEE_BPS,
    ) {
        let a = compute_amounts(amount, ratio(num, den), bps).unwrap();
        prop_assert_eq!(a.net, a.gross - a.fee);
        // gross is the floor of the exact output ...
        prop_assert!(a.gross * den <= amount * num);
        prop_assert!(amount * num < (a.gross + 1) * den);
        // ... the fee is the ceiling of its exact value ...
        prop_assert!(a.fee * BPS_DENOMINATOR >= a.gross * u128::from(bps));
        prop_assert!(a.fee * BPS_DENOMINATOR < a.gross * u128::from(bps) + BPS_DENOMINATOR);
        // ... so the user never receives more than the exact ratio output (brief §13.4).
        prop_assert!(a.net * den <= amount * num);
    }

    #[test]
    fn splitting_a_conversion_never_beats_doing_it_once(
        x in 0u128..(1 << 50),
        y in 0u128..(1 << 50),
        num in 1u128..(1 << 20),
        den in 1u128..(1 << 20),
        bps in 0u16..=MAX_FEE_BPS,
    ) {
        let r = ratio(num, den);
        let split = compute_amounts(x, r, bps).unwrap().net + compute_amounts(y, r, bps).unwrap().net;
        let whole = compute_amounts(x + y, r, bps).unwrap().net;
        prop_assert!(split <= whole);
    }

    #[test]
    fn a_zero_fee_has_no_fee_and_a_unit_ratio_is_identity(amount in 0u128..(1 << 100)) {
        let a = compute_amounts(amount, ratio(1, 1), 0).unwrap();
        prop_assert_eq!(a, Amounts { gross: amount, fee: 0, net: amount });
    }
}
