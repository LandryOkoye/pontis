//! Rules a NAV strike must satisfy to be accepted (ADR 0018 section 4).

use crate::actions_tests::with_actions;
use crate::guard_route_tests::E8;
use crate::lifecycle_tests::flags;
use crate::nav_tests::*;
use crate::price_tests::publisher_key;
use crate::tests::{account, as_account};
use crate::*;

#[test]
#[should_panic(expected = "strike is not newer than the stored one")]
fn a_strike_must_be_newer() {
    let mut c = fund();
    post(&mut c, nav("tgold-b", 10 * E8, AS_OF, CUTOFF));
    post(&mut c, nav("tgold-b", 10 * E8, AS_OF, CUTOFF + 1));
}

#[test]
#[should_panic(expected = "cutoff_ms must be after as_of_ms by at most 7 days")]
fn the_cutoff_must_follow_the_strike() {
    let mut c = fund();
    post(&mut c, nav("tgold-b", 10 * E8, AS_OF, AS_OF));
}

#[test]
#[should_panic(expected = "cutoff_ms must be after as_of_ms by at most 7 days")]
fn a_window_is_at_most_seven_days() {
    let mut c = fund();
    post(
        &mut c,
        nav("tgold-b", 10 * E8, AS_OF, AS_OF + 7 * 86_400_000 + 1),
    );
}

#[test]
#[should_panic(expected = "representation is not a nav_fund")]
fn only_a_nav_fund_takes_a_strike() {
    let mut c = fund();
    post(&mut c, nav("tgold-a", 10 * E8, AS_OF, CUTOFF));
}

#[test]
#[should_panic(expected = "bad signature")]
fn a_tampered_strike_is_refused() {
    let mut c = fund();
    let signed = nav("tgold-b", 10 * E8, AS_OF, CUTOFF);
    let signature = sign(&signed);
    as_account(account("relayer.testnet"));
    c.submit_nav_strike(
        nav("tgold-b", 11 * E8, AS_OF, CUTOFF),
        signature,
        publisher_key(),
    );
}

#[test]
#[should_panic(expected = "signer is not a registered price publisher")]
fn an_unregistered_key_is_refused() {
    let mut c = with_actions();
    flags(&mut c, "tgold-b", AssetKind::NavFund, false, false);
    post(&mut c, nav("tgold-b", 10 * E8, AS_OF, CUTOFF));
}

#[test]
#[should_panic(expected = "as_of_ms is in the future")]
fn a_strike_cannot_be_dated_ahead() {
    let mut c = fund();
    post(
        &mut c,
        nav("tgold-b", 10 * E8, 5_000 + 61_000, CUTOFF + 100_000),
    );
}
