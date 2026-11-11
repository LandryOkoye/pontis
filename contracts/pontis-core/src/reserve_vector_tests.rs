//! Shared vectors: `test-vectors/reserve-attestation.json` (signed bytes, computed independently
//! in Python) and `test-vectors/reserve-status.json` (the invariant arithmetic).

use crate::custody_fixture::*;
use crate::tests::as_account_at;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Value};

fn vector(name: &str) -> Value {
    let path = format!("{}/../../test-vectors/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn parse(v: &Value) -> ReserveAttestation {
    serde_json::from_value::<ReserveAttestation>(v.clone()).unwrap()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[test]
fn the_signed_bytes_match_the_python_rebuild() {
    let v = vector("reserve-attestation.json");
    let a = parse(&v["attestation"]);
    assert_eq!(hex(&a.signing_message().unwrap()), v["message_hex"]);
}

#[test]
fn the_dev_key_and_signature_match() {
    let v = vector("reserve-attestation.json");
    assert_eq!(String::from(&custodian_key()), v["public_key"]);
    let signature = sign(&parse(&v["attestation"]));
    assert_eq!(
        near_sdk::base64::Engine::encode(
            &near_sdk::base64::engine::general_purpose::STANDARD,
            &signature.0
        ),
        v["signature_base64"].as_str().unwrap()
    );
}

#[test]
fn every_tampered_variant_changes_the_bytes_and_fails_verification() {
    let v = vector("reserve-attestation.json");
    let good = parse(&v["attestation"]);
    let signature = sign(&good);
    let honest = custody_core(ReserveAction::Warn);
    for case in v["tampered"].as_array().unwrap() {
        let a = parse(&case["attestation"]);
        let message = a.signing_message().unwrap();
        assert_ne!(message, good.signing_message().unwrap(), "{}", case["name"]);
        let result = honest.verify_signer(
            RoleName::ReserveAttester,
            &custodian_key(),
            "reserves",
            &message,
            &signature.0,
        );
        assert_eq!(
            result,
            Err(crate::SignerError::BadSignature),
            "{}",
            case["name"]
        );
    }
}

/// Puts the case's policy, attestations and supply in storage and computes the status. One
/// contract serves every case: a unit test builds a single contract (storage outlives it).
fn status_of(c: &mut Contract, case: &Value, now: u64) -> ReserveStatus {
    as_account_at(crate::tests::owner(), now);
    let mut p = policy(ReserveAction::RestrictConversions);
    p.tolerance_bps = case["tolerance_bps"].as_u64().unwrap() as u16;
    p.max_reserve_age_ms = case["max_reserve_age_ms"].as_u64().unwrap();
    c.reserve_policies.insert("tgold-a".into(), p);
    let mut ids = Vec::new();
    for (i, a) in case["attestations"].as_array().unwrap().iter().enumerate() {
        let id = format!("vault-co-{i}");
        c.custodians.insert(
            id.clone(),
            Custodian {
                status: CustodianStatus::Active,
                ..c.get_custodian("vault-co-sim".into()).unwrap()
            },
        );
        let mut record = attestation("tgold-a", 0, a["as_of_ms"].as_u64().unwrap());
        c.reserve_latest.insert(
            format!("tgold-a|{id}"),
            ReserveRecord {
                seq: 0,
                custodian_id: id.clone(),
                reserved_units: U128(a["units"].as_str().unwrap().parse().unwrap()),
                as_of_ms: record.as_of_ms,
                submitted_ms: now,
                report_hash: std::mem::take(&mut record.report_hash),
                report_uri: String::new(),
                simulated: true,
                source: "simulated_custodian".into(),
                attester_key: custodian_key(),
            },
        );
        ids.push(id);
    }
    let link = CustodyLink {
        custodian_ids: ids,
        ..c.get_custody_link("tgold-a".into()).unwrap()
    };
    c.custody_links.insert("tgold-a".into(), link);
    let circulating: u128 = case["circulating"].as_str().unwrap().parse().unwrap();
    c.supply_ledger.insert("tgold-a".into(), circulating);
    c.compute_reserve_status("tgold-a", now)
}

#[test]
fn the_status_arithmetic_matches_the_python_vectors() {
    let v = vector("reserve-status.json");
    let now = v["now_ms"].as_u64().unwrap();
    let mut c = custody_core(ReserveAction::RestrictConversions);
    for case in v["cases"].as_array().unwrap() {
        let s = status_of(&mut c, case, now);
        let e = &case["expected"];
        let name = case["name"].as_str().unwrap();
        let state = serde_json::to_value(s.state).unwrap();
        assert_eq!(state, e["state"], "{name}: state");
        assert_eq!(
            s.attested_units.0.to_string(),
            e["attested_units"],
            "{name}"
        );
        assert_eq!(s.limit_units.0.to_string(), e["limit_units"], "{name}");
        assert_eq!(
            s.headroom_units.0.to_string(),
            e["headroom_units"],
            "{name}"
        );
        assert_eq!(
            serde_json::to_value(s.ratio_bps).unwrap(),
            e["ratio_bps"],
            "{name}"
        );
        assert_eq!(
            serde_json::to_value(s.age_ms).unwrap(),
            e["age_ms"],
            "{name}"
        );
    }
}
