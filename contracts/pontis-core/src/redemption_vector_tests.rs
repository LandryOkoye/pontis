//! Shared vectors `test-vectors/redemption-terms.json`, computed independently in Python: the
//! terms hash, window openness, the fee, and the grammar of the `redeem:` message.

use crate::redemption::parse_msg;
use crate::redemption_terms::{terms_hash, terms_message};
use crate::tests::account;
use crate::*;
use near_sdk::serde_json::{self, Value};

fn vector() -> Value {
    let path = format!(
        "{}/../../test-vectors/redemption-terms.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn terms_of(v: &Value) -> RedemptionTerms {
    serde_json::from_value(v.clone()).unwrap()
}

#[test]
fn the_terms_hash_matches_the_python_rebuild() {
    let v = vector();
    let contract = account(v["contract"].as_str().unwrap());
    for case in v["terms"].as_array().unwrap() {
        let t = terms_of(&case["terms"]);
        let rep = case["representation_id"].as_str().unwrap();
        let version = case["version"].as_u64().unwrap();
        let message: String = terms_message(&contract, rep, version, &t)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(message, case["message_hex"].as_str().unwrap());
        assert_eq!(
            terms_hash(&contract, rep, version, &t),
            case["terms_hash"].as_str().unwrap()
        );
    }
}

#[test]
fn versions_and_representations_change_the_hash() {
    let v = vector();
    let hashes: Vec<&str> = v["terms"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["terms_hash"].as_str().unwrap())
        .collect();
    assert_eq!(hashes.len(), 3);
    assert!(hashes[0] != hashes[1] && hashes[0] != hashes[2] && hashes[1] != hashes[2]);
}

#[test]
fn the_window_cases_match() {
    let v = vector();
    let w = &v["windows"];
    let t = RedemptionTerms {
        window_anchor_ms: w["anchor_ms"].as_u64().unwrap(),
        window_length_ms: w["length_ms"].as_u64().unwrap(),
        window_period_ms: w["period_ms"].as_u64().unwrap(),
        ..terms_of(&v["terms"][0]["terms"])
    };
    for case in w["cases"].as_array().unwrap() {
        let now = case["now_ms"].as_u64().unwrap();
        assert_eq!(
            t.window_open(now),
            case["open"].as_bool().unwrap(),
            "{}",
            case["name"]
        );
    }
}

#[test]
fn the_fee_cases_match() {
    let v = vector();
    for case in v["fees"].as_array().unwrap() {
        let amount: u128 = case["amount"].as_str().unwrap().parse().unwrap();
        let t = RedemptionTerms {
            fee_bps: case["fee_bps"].as_u64().unwrap() as u16,
            ..terms_of(&v["terms"][0]["terms"])
        };
        let fee = t.fee_units(amount).unwrap();
        assert_eq!(fee.to_string(), case["fee_units"].as_str().unwrap());
        assert_eq!(
            (amount - fee).to_string(),
            case["net_units"].as_str().unwrap()
        );
    }
}

#[test]
fn the_message_grammar_cases_match() {
    for case in vector()["messages"].as_array().unwrap() {
        let msg = case["msg"].as_str().unwrap();
        assert_eq!(
            parse_msg(msg).is_some(),
            case["valid_grammar"].as_bool().unwrap(),
            "{}",
            case["name"]
        );
    }
}
