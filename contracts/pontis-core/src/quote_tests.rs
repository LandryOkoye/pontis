use crate::*;
use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::{self, Value};

fn vector() -> Value {
    serde_json::from_str(include_str!("../../../test-vectors/quote-signing.json")).unwrap()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The quote from the shared vector, with the vector's signature.
pub(crate) fn signed_vector() -> ConversionMsg {
    let v = vector();
    ConversionMsg {
        quote: serde_json::from_value(v["quote"].clone()).unwrap(),
        signature: Base64VecU8(
            near_sdk::base64::Engine::decode(
                &near_sdk::base64::engine::general_purpose::STANDARD,
                v["signature_base64"].as_str().unwrap(),
            )
            .unwrap(),
        ),
    }
}

#[test]
fn the_signed_bytes_match_the_shared_vector() {
    let msg = signed_vector();
    assert_eq!(
        hex(&msg.quote.signing_message().unwrap()),
        vector()["message_hex"]
    );
}
