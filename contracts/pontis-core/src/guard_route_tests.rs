//! Guards on the route and at execution: price freshness and deviation, the fee skew, limits and
//! the circuit breaker (ADR 0016). The pair is the demo parity: A (6 decimals) to B (8 decimals)
//! at 1000, so 100 USD per A and 10 USD per B is exact parity.

use crate::compat_tests::approver;
use crate::conversion_tests::{quote_msg, ready, refused, run};
use crate::guard::*;
use crate::math::compute_amounts;
use crate::price_tests::{publisher_key, submit, with_publisher};
use crate::registry_tests::token_a;
use crate::tests::{account, alice, as_account, as_account_at, last_event, owner};
use crate::*;
use near_sdk::json_types::U128;

pub(crate) const E8: u128 = 100_000_000;
pub(crate) const AMOUNT_IN: u128 = 1_000_000;

pub(crate) fn approver2() -> AccountId {
    account("approver2.testnet")
}

pub(crate) fn guard(skew_max_bps: u16) -> RouteGuard {
    RouteGuard {
        max_deviation_bps: 100,
        hard_deviation_bps: 1_000,
        trip_after: 3,
        max_price_age_ms: 900_000,
        stale_policy: StalePolicy::FailClosed,
        min_amount_in: U128(0),
        max_amount_in: U128(0),
        window_ms: 0,
        max_window_amount_in: U128(0),
        skew_max_bps,
    }
}

/// `ready()` plus a second approver, the publisher key and `guard` on the pair (version 3).
pub(crate) fn guarded(g: RouteGuard) -> Contract {
    let mut c = ready();
    as_account(owner());
    c.grant_role(RoleName::CompatApprover, approver2());
    with_publisher(&mut c);
    as_account(approver());
    c.set_route_guard("tgold-a".into(), "tgold-b".into(), g);
    c
}

/// Prices in whole USD per token.
pub(crate) fn price_both(c: &mut Contract, a: u128, b: u128, as_of: u64) {
    submit(c, "tgold-a", a * E8, as_of);
    submit(c, "tgold-b", b * E8, as_of);
}

/// Parity prices: 100 USD for A, 10 USD for B.
pub(crate) fn at_parity(c: &mut Contract) {
    price_both(c, 100, 10, 4_000);
}

/// A quote at compatibility version 3 with the given effective fee for 1 A.
pub(crate) fn quote_at_fee(fee_bps: u16) -> String {
    let a = compute_amounts(
        AMOUNT_IN,
        crate::types::Ratio::normalised(U128(1000), U128(1)),
        fee_bps,
    )
    .unwrap();
    quote_msg(|q| {
        q.compatibility_version = 3;
        q.fee_bps = fee_bps;
        q.amount_out_gross = U128(a.gross);
        q.fee = U128(a.fee);
        q.amount_out = U128(a.net);
    })
}

pub(crate) fn rejection(c: &Contract, msg: &str) -> RejectReason {
    refused(c, msg)
}

pub(crate) fn panic_message(f: impl FnOnce() + std::panic::UnwindSafe) -> String {
    std::panic::catch_unwind(f)
        .err()
        .and_then(|e| {
            e.downcast_ref::<String>()
                .cloned()
                .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
        })
        .unwrap_or_default()
}

/// Only the B leg moves: one evaluation, one violation.
pub(crate) fn deviate_b(c: &mut Contract, as_of: u64) {
    submit(c, "tgold-b", 1_050_000_000, as_of);
}

pub(crate) fn prices_deviate(c: &mut Contract, as_of: u64) {
    // 100 against 10.5 is 4.76% below parity.
    submit(c, "tgold-a", 100 * E8, as_of);
    submit(c, "tgold-b", 1_050_000_000, as_of);
}

#[test]
fn setting_a_guard_bumps_the_version_and_voids_quotes_signed_before() {
    let mut c = ready();
    with_publisher(&mut c);
    as_account(approver());
    c.set_route_guard("tgold-a".into(), "tgold-b".into(), guard(0));
    assert_eq!(last_event()["event"], "route_guard_set");
    let rel = c
        .get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!(rel.version, 3);
    assert_eq!(rel.history.last().unwrap().action, ReviewAction::GuardSet);
    at_parity(&mut c);
    assert_eq!(
        c.get_route_guard("tgold-b".into(), "tgold-a".into()),
        Some(guard(0))
    );
    // The vector quote still carries version 2.
    assert_eq!(
        rejection(&c, &quote_msg(|_| {})),
        RejectReason::CompatibilityChanged
    );
}

#[test]
fn only_a_compat_approver_sets_a_guard() {
    let mut c = ready();
    as_account(crate::registry_tests::registrar());
    let msg = panic_message(std::panic::AssertUnwindSafe(|| {
        c.set_route_guard("tgold-a".into(), "tgold-b".into(), guard(0))
    }));
    assert!(msg.contains("not a compat approver"), "{msg}");
}

#[test]
fn a_guarded_pair_converts_at_parity_with_fresh_prices() {
    let mut c = guarded(guard(0));
    at_parity(&mut c);
    assert!(run(&c, token_a(), alice(), AMOUNT_IN, &quote_at_fee(10)).is_ok());
    assert!(c.get_route("tgold-a".into(), "tgold-b".into()).executable);
}

#[test]
fn a_missing_price_fails_closed() {
    let mut c = guarded(guard(0));
    submit(&mut c, "tgold-a", 100 * E8, 4_000);
    let view = c.get_route("tgold-a".into(), "tgold-b".into());
    assert_eq!(view.refusal, Some(RouteRefusal::PriceMissing));
    assert_eq!(rejection(&c, &quote_at_fee(10)), RejectReason::PriceMissing);
}

#[test]
fn a_stale_price_fails_closed_and_the_limit_is_exact() {
    let mut c = guarded(guard(0));
    at_parity(&mut c);
    as_account_at(token_a(), 4_000 + 900_000);
    assert!(c
        .validate_conversion(&token_a(), &alice(), U128(AMOUNT_IN), &quote_at_fee(10))
        .is_ok());
    as_account_at(token_a(), 4_000 + 900_001);
    let r = c.validate_conversion(&token_a(), &alice(), U128(AMOUNT_IN), &quote_at_fee(10));
    assert_eq!(r.unwrap_err().reason, RejectReason::PriceStale);
}

#[test]
fn a_stale_price_can_be_tolerated_at_a_wider_fee() {
    let mut c = guarded(RouteGuard {
        stale_policy: StalePolicy::FailOpenWithWiderFee { extra_fee_bps: 25 },
        ..guard(0)
    });
    // No price at all: the route opens, degraded, with 25 extra bps.
    let view = c.get_route("tgold-a".into(), "tgold-b".into());
    assert!(view.executable);
    assert_eq!(view.terms.unwrap().extra_fee_bps, 25);
    assert!(
        c.get_route_guards("tgold-a".into(), "tgold-b".into(), None)
            .degraded
    );
    assert!(run(&c, token_a(), alice(), AMOUNT_IN, &quote_at_fee(35)).is_ok());
    assert_eq!(
        rejection(&c, &quote_at_fee(10)),
        RejectReason::FeeChanged,
        "the narrow fee no longer matches"
    );
    // Fresh prices take it back to the base fee.
    at_parity(&mut c);
    assert!(run(&c, token_a(), alice(), AMOUNT_IN, &quote_at_fee(10)).is_ok());
}

#[test]
fn a_deviation_beyond_the_limit_is_refused_and_one_within_it_is_not() {
    let mut c = guarded(guard(0));
    prices_deviate(&mut c, 4_000);
    let view = c.get_route("tgold-a".into(), "tgold-b".into());
    assert_eq!(view.refusal, Some(RouteRefusal::PriceDeviation));
    assert_eq!(
        rejection(&c, &quote_at_fee(10)),
        RejectReason::PriceDeviation
    );
    // 100 against 10.05 is 0.5% off parity; allow 100 bps (1%).
    submit(&mut c, "tgold-b", 1_005_000_000, 4_100);
    assert!(c.get_route("tgold-a".into(), "tgold-b".into()).executable);
}

#[test]
fn prices_in_different_currencies_are_not_compared() {
    let mut c = guarded(guard(0));
    at_parity(&mut c);
    let mut a = crate::price_tests::attestation("tgold-b", 10 * E8, 4_100);
    a.currency = "EUR".into();
    let s = crate::price_tests::sign_price(&a);
    assert_eq!(
        crate::price_submit_tests::try_submit(&mut c, a, s, publisher_key()),
        None
    );
    let view = c.get_route("tgold-a".into(), "tgold-b".into());
    assert_eq!(view.refusal, Some(RouteRefusal::PriceUnavailable));
}

#[test]
fn the_guard_breakdown_names_every_check() {
    let mut c = guarded(guard(0));
    prices_deviate(&mut c, 4_000);
    let g = c.get_route_guards("tgold-a".into(), "tgold-b".into(), Some(U128(AMOUNT_IN)));
    assert!(!g.executable);
    let named = |name: &str| g.checks.iter().find(|x| x.name == name).unwrap();
    assert!(!named("route").passed);
    assert!(named("route").detail.contains("PriceDeviation"));
    assert!(named("guard").passed);
    assert!(named("circuit_breaker").passed);
    assert_eq!(
        g.checks
            .iter()
            .filter(|x| x.name == "price_freshness")
            .count(),
        2
    );
    assert_eq!(g.fee_bps, None, "no fee for a closed route");
}
