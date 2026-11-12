use crate::registry_tests::pauser;
use crate::tests::{account, as_account, last_event, new_core, owner};
use crate::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{CurveType, PublicKey};

/// The publisher key every price test uses: seed 101..=132.
pub(crate) fn signing_key() -> SigningKey {
    let seed: [u8; 32] = (101..=132u8).collect::<Vec<_>>().try_into().unwrap();
    SigningKey::from_bytes(&seed)
}

pub(crate) fn publisher_key() -> PublicKey {
    PublicKey::from_parts(
        CurveType::ED25519,
        signing_key().verifying_key().to_bytes().to_vec(),
    )
    .unwrap()
}

pub(crate) fn attestation(rep: &str, price: u128, as_of_ms: u64) -> PriceAttestation {
    PriceAttestation {
        version: 1,
        contract: account("core.testnet"),
        representation_id: rep.to_string(),
        price: U128(price),
        currency: "USD".to_string(),
        as_of_ms,
        simulated: true,
        source: "simulated_feed".to_string(),
    }
}

pub(crate) fn sign_price(a: &PriceAttestation) -> Base64VecU8 {
    Base64VecU8(
        signing_key()
            .sign(&a.signing_message().unwrap())
            .to_bytes()
            .to_vec(),
    )
}

/// Registers the publisher key as the owner, then leaves the context as `relayer`.
pub(crate) fn with_publisher(c: &mut Contract) {
    as_account(owner());
    c.add_price_publisher_key(publisher_key());
    as_account(account("relayer.testnet"));
}

/// Submits a signed price for `rep` as the relayer at the current block time.
pub(crate) fn submit(c: &mut Contract, rep: &str, price: u128, as_of_ms: u64) {
    let a = attestation(rep, price, as_of_ms);
    let signature = sign_price(&a);
    as_account(account("relayer.testnet"));
    c.submit_price(a, signature, publisher_key());
}

pub(crate) fn core_with_publisher() -> Contract {
    let mut c = crate::compat_tests::two_reps();
    with_publisher(&mut c);
    c
}

#[test]
fn the_signed_bytes_match_the_shared_vector() {
    let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(include_str!(
        "../../../test-vectors/price-attestation.json"
    ))
    .unwrap();
    let a: PriceAttestation = near_sdk::serde_json::from_value(v["attestation"].clone()).unwrap();
    let hex: String = a
        .signing_message()
        .unwrap()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    assert_eq!(hex, v["message_hex"].as_str().unwrap());
    assert_eq!(
        sign_price(&a).0,
        near_sdk::base64::Engine::decode(
            &near_sdk::base64::engine::general_purpose::STANDARD,
            v["signature_base64"].as_str().unwrap()
        )
        .unwrap()
    );
    assert_eq!(String::from(&publisher_key()), v["public_key"]);
}

#[test]
fn only_the_owner_manages_publisher_keys_and_only_ed25519_keys_are_accepted() {
    let mut c = new_core();
    c.add_price_publisher_key(publisher_key());
    assert_eq!(c.get_price_publisher_keys(), vec![publisher_key()]);
    assert_eq!(last_event()["event"], "price_publisher_key_added");
    c.remove_price_publisher_key(publisher_key());
    assert!(c.get_price_publisher_keys().is_empty());
    assert_eq!(last_event()["event"], "price_publisher_key_removed");
}

#[test]
#[should_panic(expected = "only the owner")]
fn a_pauser_cannot_add_a_publisher_key() {
    let mut c = new_core();
    as_account(pauser());
    c.add_price_publisher_key(publisher_key());
}

#[test]
#[should_panic(expected = "ed25519")]
fn a_secp256k1_publisher_key_is_refused() {
    let mut c = new_core();
    c.add_price_publisher_key(PublicKey::from_parts(CurveType::SECP256K1, vec![7; 64]).unwrap());
}

#[test]
#[should_panic(expected = "already a price publisher")]
fn a_key_cannot_be_added_twice() {
    let mut c = new_core();
    c.add_price_publisher_key(publisher_key());
    c.add_price_publisher_key(publisher_key());
}
