use crate::registry_tests::pauser;
use crate::tests::{alice, as_account, last_event, new_core, owner};
use crate::*;
use near_sdk::{CurveType, PublicKey};

pub(crate) const SIGNER_A: &str = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp";
const SIGNER_B: &str = "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847";

fn key(s: &str) -> PublicKey {
    s.parse().unwrap()
}

#[test]
fn defaults_are_a_ten_bps_fee_and_no_signer() {
    let c = new_core();
    assert_eq!(c.get_fee_bps(), 10);
    assert_eq!(c.get_quote_signer(), None);
}

#[test]
fn the_owner_sets_and_rotates_the_quote_signer() {
    let mut c = new_core();
    c.set_quote_signer(key(SIGNER_A));
    assert_eq!(c.get_quote_signer(), Some(key(SIGNER_A)));
    let e = last_event();
    assert_eq!(e["event"], "quote_signer_set");
    assert_eq!(e["data"]["public_key"], SIGNER_A);

    c.set_quote_signer(key(SIGNER_B));
    assert_eq!(
        c.get_quote_signer(),
        Some(key(SIGNER_B)),
        "rotation replaces, no overlap"
    );
}

#[test]
fn the_owner_can_rotate_the_signer_and_set_the_fee_while_paused() {
    let mut c = new_core();
    c.grant_role(RoleName::Pauser, pauser());
    as_account(pauser());
    c.pause();
    as_account(owner());
    c.set_quote_signer(key(SIGNER_A));
    c.set_fee_bps(25);
    assert_eq!(c.get_fee_bps(), 25);
}

#[test]
#[should_panic(expected = "only the owner")]
fn only_the_owner_sets_the_quote_signer() {
    let mut c = new_core();
    as_account(alice());
    c.set_quote_signer(key(SIGNER_A));
}

#[test]
#[should_panic(expected = "must be an ed25519 key")]
fn the_quote_signer_must_be_ed25519() {
    let mut c = new_core();
    c.set_quote_signer(PublicKey::from_parts(CurveType::SECP256K1, vec![1; 64]).unwrap());
}

#[test]
fn the_fee_can_reach_but_not_exceed_the_cap() {
    let mut c = new_core();
    c.set_fee_bps(100);
    assert_eq!(c.get_fee_bps(), 100);
    assert_eq!(last_event()["event"], "fee_updated");
    assert_eq!(last_event()["data"]["fee_bps"], 100);
    c.set_fee_bps(0);
    assert_eq!(c.get_fee_bps(), 0);
}

#[test]
#[should_panic(expected = "exceeds the 100 bps cap")]
fn a_fee_above_the_cap_is_refused() {
    let mut c = new_core();
    c.set_fee_bps(101);
}

#[test]
#[should_panic(expected = "only the owner")]
fn only_the_owner_sets_the_fee() {
    let mut c = new_core();
    as_account(alice());
    c.set_fee_bps(1);
}
