//! The NAV strike layout is pinned by `test-vectors/nav-strike.json`, built independently in
//! Python and reproduced by `@pontis/market-data`; this is the contract's side of it.

use crate::nav::NavAttestation;

#[test]
fn the_signed_bytes_match_the_shared_vector() {
    let v: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(include_str!("../../../test-vectors/nav-strike.json"))
            .unwrap();
    let a: NavAttestation = near_sdk::serde_json::from_value(v["attestation"].clone()).unwrap();
    let hex: String = a
        .signing_message()
        .unwrap()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    assert_eq!(hex, v["message_hex"].as_str().unwrap());
}
