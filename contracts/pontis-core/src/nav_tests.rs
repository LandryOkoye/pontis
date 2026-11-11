//! NAV strikes and the window (ADR 0018 sections 3 and 4).

use crate::actions_tests::with_actions;
use crate::compat_tests::approver;
use crate::guard_route_tests::{guard, E8};
use crate::lifecycle_tests::flags;
use crate::price_tests::{publisher_key, signing_key, submit, with_publisher};
use crate::tests::{account, alice, as_account, as_account_at, last_event};
use crate::*;
use ed25519_dalek::Signer;
use near_sdk::json_types::{Base64VecU8, U128};

pub(crate) const AS_OF: u64 = 5_000;
pub(crate) const CUTOFF: u64 = 105_000;

pub(crate) fn nav(rep: &str, nav: u128, as_of_ms: u64, cutoff_ms: u64) -> NavAttestation {
    NavAttestation {
        version: 1,
        contract: account("core.testnet"),
        representation_id: rep.into(),
        nav: U128(nav),
        currency: "USD".into(),
        as_of_ms,
        cutoff_ms,
        simulated: true,
        source: "simulated_fund_admin".into(),
    }
}

pub(crate) fn sign(a: &NavAttestation) -> Base64VecU8 {
    Base64VecU8(
        signing_key()
            .sign(&a.signing_message().unwrap())
            .to_bytes()
            .to_vec(),
    )
}

pub(crate) fn post(c: &mut Contract, a: NavAttestation) {
    let signature = sign(&a);
    as_account(account("relayer.testnet"));
    c.submit_nav_strike(a, signature, publisher_key());
}

/// A parity pair whose B side is a `nav_fund`; publisher registered, no strike yet.
pub(crate) fn fund() -> Contract {
    let mut c = with_actions();
    flags(&mut c, "tgold-b", AssetKind::NavFund, false, false);
    with_publisher(&mut c);
    c
}

pub(crate) fn route_at(c: &Contract, at: u64) -> RouteView {
    as_account_at(alice(), at);
    c.get_route("tgold-a".into(), "tgold-b".into())
}

#[test]
fn the_signed_bytes_are_the_domain_then_the_borsh_fields() {
    let a = nav("tgold-b", 1_234, 7, 9);
    let mut expected = b"pontis-nav-v1".to_vec();
    expected.push(1);
    for s in ["core.testnet", "tgold-b"] {
        expected.extend((s.len() as u32).to_le_bytes());
        expected.extend(s.bytes());
    }
    expected.extend(1_234u128.to_le_bytes());
    expected.extend(3u32.to_le_bytes());
    expected.extend(b"USD");
    expected.extend(7u64.to_le_bytes());
    expected.extend(9u64.to_le_bytes());
    expected.push(1);
    expected.extend(20u32.to_le_bytes());
    expected.extend(b"simulated_fund_admin");
    assert_eq!(a.signing_message().unwrap(), expected);
}

#[test]
fn the_window_is_half_open_and_bounded_by_twice_the_interval() {
    let s = NavStrike {
        as_of_ms: 1_000,
        nav_per_unit: U128(1),
        cutoff_ms: 2_000,
        currency: "USD".into(),
        source: "s".into(),
        simulated: true,
        submitted_ms: 1_000,
        publisher_key: publisher_key(),
    };
    assert!(!s.window_open(999));
    assert!(s.window_open(1_000));
    assert!(s.window_open(1_999));
    assert!(!s.window_open(2_000));
}

#[test]
fn a_nav_fund_converts_only_inside_an_open_strike_window() {
    let mut c = fund();
    assert_eq!(
        route_at(&c, AS_OF).refusal,
        Some(RouteRefusal::NavWindowClosed)
    );
    post(&mut c, nav("tgold-b", 10 * E8, AS_OF, CUTOFF));
    let e = last_event();
    assert_eq!(e["event"], "nav_strike_posted");
    assert_eq!(e["data"]["simulated"], true);
    assert_eq!(e["data"]["source"], "simulated_fund_admin");
    assert!(route_at(&c, AS_OF).executable);
    assert!(route_at(&c, CUTOFF - 1).executable);
    assert_eq!(
        route_at(&c, CUTOFF).refusal,
        Some(RouteRefusal::NavWindowClosed)
    );
    assert_eq!(
        c.get_nav_strike("tgold-b".into()).unwrap().cutoff_ms,
        CUTOFF
    );
}

#[test]
fn the_next_strike_opens_the_next_window() {
    let mut c = fund();
    post(&mut c, nav("tgold-b", 10 * E8, AS_OF, CUTOFF));
    as_account_at(account("relayer.testnet"), CUTOFF + 10);
    let a = nav("tgold-b", 10 * E8, CUTOFF + 10, CUTOFF + 100_000);
    let signature = sign(&a);
    c.submit_nav_strike(a, signature, publisher_key());
    assert!(route_at(&c, CUTOFF + 20).executable);
}

#[test]
fn the_strike_is_the_reference_price_of_the_fund_in_the_deviation_guard() {
    let mut c = fund();
    as_account(approver());
    c.set_route_guard("tgold-a".into(), "tgold-b".into(), guard(0));
    submit(&mut c, "tgold-a", 100 * E8, AS_OF);
    post(&mut c, nav("tgold-b", 10 * E8, AS_OF, CUTOFF));
    assert!(route_at(&c, AS_OF + 1).executable, "parity strike");
    as_account_at(account("relayer.testnet"), AS_OF + 2);
    let a = nav("tgold-b", 1_050_000_000, AS_OF + 2, CUTOFF);
    let signature = sign(&a);
    c.submit_nav_strike(a, signature, publisher_key());
    assert_eq!(
        route_at(&c, AS_OF + 3).refusal,
        Some(RouteRefusal::PriceDeviation),
        "a strike 4.8% off parity"
    );
}
