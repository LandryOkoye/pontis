//! The shared guard vectors (`test-vectors/route-guard.json`): computed with unbounded integers in
//! Python and reproduced here and in `@pontis/quote-engine`.

use crate::guard::RouteGuard;
use crate::guard::{LimitRefusal, StalePolicy};
use crate::guard_math::*;
use crate::types::Ratio;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Value};

fn vector() -> Value {
    serde_json::from_str(include_str!("../../../test-vectors/route-guard.json")).unwrap()
}

fn u(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

fn ratio(v: &Value) -> Ratio {
    Ratio {
        num: U128(u(&v["num"])),
        den: U128(u(&v["den"])),
    }
}

#[test]
fn deviation_matches_the_shared_vectors() {
    for case in vector()["deviation"].as_array().unwrap() {
        let i = &case["input"];
        let max = i["max_bps"].as_u64().unwrap() as u32;
        let terms = deviation_terms(
            ratio(&i["ratio"]),
            u(&i["price_from"]),
            u(&i["price_to"]),
            i["decimals_from"].as_u64().unwrap() as u8,
            i["decimals_to"].as_u64().unwrap() as u8,
        );
        let verdict = terms.and_then(|(x, y)| Some((exceeds(x, y, max)?, deviation_bps(x, y)?)));
        let e = &case["expected"];
        match verdict {
            None => assert_eq!(e["available"], false, "{i}"),
            Some((exceeded, bps)) => {
                assert_eq!(e["available"], true, "{i}");
                assert_eq!(e["exceeds"], exceeded, "{i}");
                assert_eq!(u(&e["deviation_bps"]), bps, "{i}");
            }
        }
    }
}

#[test]
fn skew_matches_the_shared_vectors() {
    for case in vector()["skew"].as_array().unwrap() {
        let i = &case["input"];
        let got = skew_bps(
            i["skew_max_bps"].as_u64().unwrap() as u16,
            u(&i["reference"]),
            u(&i["inventory_after"]),
        );
        assert_eq!(u64::from(got), case["expected"].as_u64().unwrap(), "{i}");
    }
}

#[test]
fn the_effective_fee_matches_the_shared_vectors() {
    for case in vector()["fee"].as_array().unwrap() {
        let i = &case["input"];
        let got = fee_with_skew(
            i["protocol_fee_bps"].as_u64().unwrap() as u16,
            i["extra_fee_bps"].as_u64().unwrap() as u16,
            i["skew_max_bps"].as_u64().unwrap() as u16,
            u(&i["reference"]),
            u(&i["inventory"]),
            u(&i["amount_in"]),
            ratio(&i["ratio"]),
        );
        assert_eq!(u64::from(got), case["expected"].as_u64().unwrap(), "{i}");
    }
}

#[test]
fn limits_match_the_shared_vectors() {
    for case in vector()["limits"].as_array().unwrap() {
        let i = &case["input"];
        let guard = RouteGuard {
            max_deviation_bps: 100,
            hard_deviation_bps: 100,
            trip_after: 1,
            max_price_age_ms: 60_000,
            stale_policy: StalePolicy::FailClosed,
            min_amount_in: U128(u(&i["min_amount_in"])),
            max_amount_in: U128(u(&i["max_amount_in"])),
            window_ms: i["window_ms"].as_u64().unwrap(),
            max_window_amount_in: U128(u(&i["max_window_amount_in"])),
            skew_max_bps: 0,
        };
        let got = match guard.check_limits(u(&i["amount_in"]), u(&i["window_used"])) {
            Ok(()) => "ok",
            Err(LimitRefusal::BelowMin) => "below_min",
            Err(LimitRefusal::AboveMax) => "above_max",
            Err(LimitRefusal::WindowExceeded) => "window_exceeded",
        };
        assert_eq!(got, case["expected"].as_str().unwrap(), "{i}");
    }
}
