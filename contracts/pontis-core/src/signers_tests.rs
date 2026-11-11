use crate::signers::MAX_SIGNER_KEYS;
use crate::tests::{alice, as_account, bob, last_event, new_core, owner};
use crate::*;
use ed25519_dalek::SigningKey;
use near_sdk::{CurveType, PublicKey};

/// A deterministic dev key: seed `[n; 32]`.
pub(crate) fn key_from(n: u8) -> SigningKey {
    SigningKey::from_bytes(&[n; 32])
}

pub(crate) fn public(sk: &SigningKey) -> PublicKey {
    PublicKey::from_parts(CurveType::ED25519, sk.verifying_key().to_bytes().to_vec()).unwrap()
}

/// Core with `alice` as reserve attester (key seed 7, scope `reserves`); context left as owner.
pub(crate) fn core_with_key() -> Contract {
    let mut c = new_core();
    c.grant_role(RoleName::ReserveAttester, alice());
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        public(&key_from(7)),
        vec!["reserves".to_string()],
    );
    c
}

#[test]
fn attester_roles_are_grantable_and_listed() {
    let mut c = new_core();
    c.grant_role(RoleName::Attester, alice());
    c.grant_role(RoleName::ReserveAttester, bob());
    c.grant_role(RoleName::BridgeAttester, bob());
    assert_eq!(c.get_account_roles(alice()), vec!["attester"]);
    assert_eq!(
        c.get_account_roles(bob()),
        vec!["reserve_attester", "bridge_attester"]
    );
    assert_eq!(c.get_role_members(RoleName::BridgeAttester), vec![bob()]);
    assert_eq!(last_event()["data"]["role"], "bridge_attester");
}

#[test]
fn account_roles_list_the_owner_first() {
    let mut c = new_core();
    c.grant_role(RoleName::Pauser, owner());
    c.grant_role(RoleName::Registrar, owner());
    assert_eq!(
        c.get_account_roles(owner()),
        vec!["owner", "registrar", "pauser"]
    );
    assert!(c.get_account_roles(alice()).is_empty());
}

#[test]
fn add_signer_key_stores_it_and_emits() {
    let c = core_with_key();
    let keys = c.get_signer_keys(RoleName::ReserveAttester);
    assert_eq!(keys.len(), 1);
    assert_eq!(keys[0].account_id, alice());
    assert_eq!(keys[0].public_key, public(&key_from(7)));
    assert_eq!(keys[0].scopes, vec!["reserves"]);
    let e = last_event();
    assert_eq!(e["event"], "signer_key_added");
    assert_eq!(e["data"]["role"], "reserve_attester");
    assert_eq!(e["data"]["account_id"], "alice.testnet");
    assert_eq!(e["data"]["scopes"][0], "reserves");
    assert!(c.get_signer_keys(RoleName::Attester).is_empty());
}

#[test]
fn remove_signer_key_stops_it() {
    let mut c = core_with_key();
    c.remove_signer_key(RoleName::ReserveAttester, public(&key_from(7)));
    assert!(c.get_signer_keys(RoleName::ReserveAttester).is_empty());
    assert_eq!(last_event()["event"], "signer_key_removed");
}

#[test]
#[should_panic(expected = "key is not registered for this role")]
fn removing_an_unknown_key_fails() {
    let mut c = core_with_key();
    c.remove_signer_key(RoleName::ReserveAttester, public(&key_from(8)));
}

#[test]
#[should_panic(expected = "only the owner")]
fn only_the_owner_manages_keys() {
    let mut c = new_core();
    c.grant_role(RoleName::ReserveAttester, alice());
    as_account(alice());
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        public(&key_from(7)),
        vec!["reserves".to_string()],
    );
}

#[test]
#[should_panic(expected = "account does not hold this role")]
fn a_key_needs_a_role_holder() {
    let mut c = new_core();
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        public(&key_from(7)),
        vec!["reserves".to_string()],
    );
}

#[test]
#[should_panic(expected = "role has no signer key registry")]
fn registrar_has_no_key_registry() {
    let mut c = new_core();
    c.grant_role(RoleName::Registrar, alice());
    c.add_signer_key(
        RoleName::Registrar,
        alice(),
        public(&key_from(7)),
        vec!["reserves".to_string()],
    );
}

#[test]
#[should_panic(expected = "scope is not allowed for this role")]
fn scope_must_belong_to_the_role() {
    let mut c = new_core();
    c.grant_role(RoleName::ReserveAttester, alice());
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        public(&key_from(7)),
        vec!["bridge".to_string()],
    );
}

#[test]
#[should_panic(expected = "duplicate scope")]
fn scopes_must_be_distinct() {
    let mut c = new_core();
    c.grant_role(RoleName::ReserveAttester, alice());
    let scope = "reserves".to_string();
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        public(&key_from(7)),
        vec![scope.clone(), scope],
    );
}

#[test]
#[should_panic(expected = "a key needs 1 to 4 scopes")]
fn a_key_needs_a_scope() {
    let mut c = new_core();
    c.grant_role(RoleName::ReserveAttester, alice());
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        public(&key_from(7)),
        vec![],
    );
}

#[test]
#[should_panic(expected = "signer key must be an ed25519 key")]
fn a_secp256k1_key_is_refused() {
    let mut c = new_core();
    c.grant_role(RoleName::ReserveAttester, alice());
    let key = PublicKey::from_parts(CurveType::SECP256K1, vec![1; 64]).unwrap();
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        key,
        vec!["reserves".to_string()],
    );
}

#[test]
#[should_panic(expected = "key is already registered for this role")]
fn a_key_registers_once_per_role() {
    let mut c = core_with_key();
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        public(&key_from(7)),
        vec!["custody".to_string()],
    );
}

#[test]
#[should_panic(expected = "too many signer keys for this role")]
fn keys_are_capped_per_role() {
    let mut c = new_core();
    c.grant_role(RoleName::ReserveAttester, alice());
    for n in 0..=MAX_SIGNER_KEYS as u8 {
        c.add_signer_key(
            RoleName::ReserveAttester,
            alice(),
            public(&key_from(20 + n)),
            vec!["reserves".to_string()],
        );
    }
}
