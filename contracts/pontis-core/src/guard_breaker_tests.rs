//! The circuit breaker (ADR 0016 section 5): trips, resets and who may reset.

use crate::compat_tests::approver;
use crate::guard::*;
use crate::guard_route_tests::*;
use crate::price_tests::submit;
use crate::registry_tests::token_a;
use crate::tests::{account, alice, as_account, last_event, owner};
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::PromiseOrValue;

#[test]
fn the_breaker_trips_after_consecutive_violations_and_not_before() {
    let mut c = guarded(guard(0));
    at_parity(&mut c);
    deviate_b(&mut c, 4_100);
    deviate_b(&mut c, 4_200);
    let state = c
        .get_circuit_breaker("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!((state.consecutive_violations, state.tripped), (2, false));
    // A passing price resets the count.
    submit(&mut c, "tgold-b", 10 * E8, 4_250);
    let state = c
        .get_circuit_breaker("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!(state.consecutive_violations, 0);
    for t in [4_300, 4_400, 4_500] {
        deviate_b(&mut c, t);
    }
    let rel = c
        .get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!(rel.status, RelationshipStatus::Suspended);
    let e = last_event();
    assert_eq!(e["event"], "circuit_breaker_tripped");
    assert_eq!(e["data"]["reason"], "consecutive_violations");
    assert_eq!(e["data"]["deviation_bps"], 476);
    let state = c
        .get_circuit_breaker("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!((state.tripped, state.trip_count), (true, 1));
}

#[test]
fn a_deviation_past_the_hard_bound_trips_at_once() {
    let mut c = guarded(RouteGuard {
        hard_deviation_bps: 400,
        ..guard(0)
    });
    at_parity(&mut c);
    prices_deviate(&mut c, 4_100);
    let e = last_event();
    assert_eq!(e["event"], "circuit_breaker_tripped");
    assert_eq!(e["data"]["reason"], "hard_bound");
}

#[test]
fn a_refused_conversion_counts_toward_the_breaker() {
    let mut c = guarded(RouteGuard {
        trip_after: 2,
        ..guard(0)
    });
    at_parity(&mut c);
    prices_deviate(&mut c, 4_100);
    // One violation from the price update; the next one is a conversion attempt.
    as_account(token_a());
    let out = c.ft_on_transfer(alice(), U128(AMOUNT_IN), quote_at_fee(10));
    assert!(
        matches!(out, PromiseOrValue::Value(v) if v.0 == AMOUNT_IN),
        "the input is returned"
    );
    let rel = c
        .get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!(rel.status, RelationshipStatus::Suspended);
    assert_eq!(
        c.get_inventory("tgold-b".into()).0,
        1_000_000_000_000,
        "nothing moved"
    );
}

#[test]
fn only_a_different_approver_can_reset_and_only_when_the_guard_passes() {
    let mut c = guarded(RouteGuard {
        hard_deviation_bps: 400,
        ..guard(0)
    });
    at_parity(&mut c);
    prices_deviate(&mut c, 4_100);

    let reset = |c: &mut Contract, who: AccountId| {
        as_account(who);
        panic_message(std::panic::AssertUnwindSafe(|| {
            c.reset_circuit_breaker("tgold-a".into(), "tgold-b".into(), "Reviewed".into())
        }))
    };
    assert!(reset(&mut c, approver()).contains("proposer cannot reset"));
    assert!(reset(&mut c, approver2()).contains("guard still violated"));
    // approve_compatibility is not a way around the breaker.
    as_account(approver2());
    let msg = panic_message(std::panic::AssertUnwindSafe(|| {
        c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Reviewed".into())
    }));
    assert!(msg.contains("reset_circuit_breaker"), "{msg}");

    submit(&mut c, "tgold-b", 10 * E8, 4_310);
    as_account(approver2());
    c.reset_circuit_breaker(
        "tgold-a".into(),
        "tgold-b".into(),
        "Prices recovered".into(),
    );
    let rel = c
        .get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!(rel.status, RelationshipStatus::Approved);
    assert_eq!(rel.classification, Classification::DirectEquivalent);
    assert_eq!(rel.version, 5, "guard 3, trip 4, reset 5");
    assert_eq!(rel.approved_by, Some(approver2()));
    let state = c
        .get_circuit_breaker("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!(
        (
            state.tripped,
            state.consecutive_violations,
            state.trip_count
        ),
        (false, 0, 1)
    );
    assert_eq!(last_event()["event"], "circuit_breaker_reset");
}

#[test]
fn the_account_that_triggered_the_trip_cannot_reset_it() {
    let mut c = guarded(RouteGuard {
        hard_deviation_bps: 400,
        ..guard(0)
    });
    at_parity(&mut c);
    prices_deviate(&mut c, 4_100);
    // The relayer triggered it; give the relayer the approver role to prove the rule.
    as_account(owner());
    c.grant_role(RoleName::CompatApprover, account("relayer.testnet"));
    at_parity_prices_recovered(&mut c);
    as_account(account("relayer.testnet"));
    let msg = panic_message(std::panic::AssertUnwindSafe(|| {
        c.reset_circuit_breaker("tgold-a".into(), "tgold-b".into(), "Reviewed".into())
    }));
    assert!(msg.contains("account that triggered the trip"), "{msg}");
}
#[test]
fn a_pauser_suspension_is_not_a_breaker_trip() {
    let mut c = guarded(guard(0));
    at_parity(&mut c);
    as_account(crate::registry_tests::pauser());
    c.suspend_compatibility("tgold-a".into(), "tgold-b".into(), "Incident".into());
    as_account(approver2());
    let msg = panic_message(std::panic::AssertUnwindSafe(|| {
        c.reset_circuit_breaker("tgold-a".into(), "tgold-b".into(), "x".into())
    }));
    assert!(
        msg.contains("no circuit breaker state") || msg.contains("not tripped"),
        "{msg}"
    );
}

fn at_parity_prices_recovered(c: &mut Contract) {
    submit(c, "tgold-a", 100 * E8, 4_300);
    submit(c, "tgold-b", 10 * E8, 4_310);
}
