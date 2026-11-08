use crate::tests::{new_core, owner};
use crate::*;
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::{self, Value};
use near_sdk::PublicKey;

type Alter = Box<dyn Fn(&mut QuoteInput)>;

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

/// A core whose quote signer is the vector's public key.
pub(crate) fn core_with_signer() -> Contract {
    let mut c = new_core();
    crate::tests::as_account(owner());
    let key: PublicKey = vector()["public_key"].as_str().unwrap().parse().unwrap();
    c.set_quote_signer(key);
    c
}

#[test]
fn the_signed_bytes_match_the_shared_vector() {
    let msg = signed_vector();
    assert_eq!(
        hex(&msg.quote.signing_message().unwrap()),
        vector()["message_hex"]
    );
}

#[test]
fn a_valid_signature_verifies_and_yields_the_nonce() {
    let c = core_with_signer();
    let nonce = c.verify_quote(&signed_vector()).unwrap();
    assert_eq!(hex(&nonce), "000102030405060708090a0b0c0d0e0f");
}

#[test]
fn without_a_signer_nothing_verifies() {
    let c = new_core();
    assert_eq!(
        c.verify_quote(&signed_vector()),
        Err(RejectReason::SignerNotSet)
    );
}

#[test]
fn a_rotated_signer_invalidates_old_quotes() {
    let mut c = core_with_signer();
    c.set_quote_signer(
        "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847"
            .parse()
            .unwrap(),
    );
    assert_eq!(
        c.verify_quote(&signed_vector()),
        Err(RejectReason::BadSignature)
    );
}

#[test]
fn altering_any_signed_field_breaks_the_signature() {
    let c = core_with_signer();
    let alter: Vec<(&str, Alter)> = vec![
        ("version", Box::new(|q| q.version = 2)),
        (
            "contract",
            Box::new(|q| q.contract = "other.testnet".parse().unwrap()),
        ),
        (
            "user",
            Box::new(|q| q.user = "mallory.testnet".parse().unwrap()),
        ),
        (
            "token_in",
            Box::new(|q| q.token_in = "tgold-b.testnet".parse().unwrap()),
        ),
        (
            "token_out",
            Box::new(|q| q.token_out = "tgold-a.testnet".parse().unwrap()),
        ),
        ("amount_in", Box::new(|q| q.amount_in = U128(1_000_001))),
        (
            "amount_out_gross",
            Box::new(|q| q.amount_out_gross = U128(1_000_000_001)),
        ),
        ("fee", Box::new(|q| q.fee = U128(0))),
        (
            "amount_out",
            Box::new(|q| q.amount_out = U128(1_000_000_000)),
        ),
        ("fee_bps", Box::new(|q| q.fee_bps = 0)),
        ("expires_at_ms", Box::new(|q| q.expires_at_ms += 1)),
        ("nonce", Box::new(|q| q.nonce = "ff".repeat(16))),
        (
            "compatibility_version",
            Box::new(|q| q.compatibility_version = 3),
        ),
        ("policy_version", Box::new(|q| q.policy_version = 2)),
    ];
    for (field, f) in alter {
        let mut msg = signed_vector();
        f(&mut msg.quote);
        assert_eq!(
            c.verify_quote(&msg),
            Err(RejectReason::BadSignature),
            "field {field}"
        );
    }
}

#[test]
fn a_malformed_signature_or_nonce_is_rejected_not_panicking() {
    let c = core_with_signer();
    let mut short = signed_vector();
    short.signature = Base64VecU8(vec![0; 63]);
    assert_eq!(c.verify_quote(&short), Err(RejectReason::BadSignature));
    for bad in ["", "zz", &"0".repeat(31), &"G".repeat(32), &"A".repeat(32)] {
        let mut msg = signed_vector();
        msg.quote.nonce = bad.to_string();
        assert_eq!(
            c.verify_quote(&msg),
            Err(RejectReason::InvalidMsg),
            "nonce {bad:?}"
        );
    }
}

/// Signs `quote` with the vector's key, as the backend would.
pub(crate) fn sign(quote: QuoteInput) -> ConversionMsg {
    use ed25519_dalek::{Signer, SigningKey};
    let seed: [u8; 32] = (1..=32u8).collect::<Vec<_>>().try_into().unwrap();
    let signature = SigningKey::from_bytes(&seed).sign(&quote.signing_message().unwrap());
    ConversionMsg {
        quote,
        signature: Base64VecU8(signature.to_bytes().to_vec()),
    }
}

#[test]
fn the_test_signer_reproduces_the_vector_signature() {
    let expected = signed_vector();
    assert_eq!(sign(expected.quote.clone()).signature, expected.signature);
}
