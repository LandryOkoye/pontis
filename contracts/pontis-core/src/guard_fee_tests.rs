//! The fee skew, the per-transaction limits and the window at execution (ADR 0016 sections 3, 4).

use crate::conversion_tests::ready;
use crate::conversion_tests::{quote_msg, run};
use crate::guard::*;
use crate::guard_route_tests::*;
use crate::math::compute_amounts;
use crate::price_tests::with_publisher;
use crate::registry_tests::token_a;
use crate::tests::{account, alice, as_account, as_account_at, owner};
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::PromiseOrValue;

#[test]
fn the_fee_rises_as_the_output_vault_drains() {
    let mut c = guarded(guard(100));
    at_parity(&mut c);
    // Reference 1e12, a conversion pays out 999e6: depletion 0.0999%, skew ceil(100 * 1e-6) = 1.
    assert_eq!(rejection(&c, &quote_at_fee(10)), RejectReason::FeeChanged);
    assert!(run(&c, token_a(), alice(), AMOUNT_IN, &quote_at_fee(11)).is_ok());
    let g = c.get_route_guards("tgold-a".into(), "tgold-b".into(), Some(U128(AMOUNT_IN)));
    assert_eq!((g.fee_bps, g.skew_bps), (Some(11), Some(1)));

    // Withdrawing half lowers the reference with the inventory, so the skew does not jump.
    as_account(owner());
    let _ = c.withdraw_inventory(
        "tgold-b".into(),
        U128(500_000_000_000),
        account("treasury.testnet"),
    );
    assert_eq!(
        c.get_inventory_reference("tgold-b".into()).0,
        500_000_000_000
    );
    // A big conversion (500 B at parity needs 5e11 * ... ) pays out most of what is left: heavy skew.
    let big = 400_000_000u128; // 400 A tokens -> 4e11 B smallest units
    let g = c.get_route_guards("tgold-a".into(), "tgold-b".into(), Some(U128(big)));
    assert!(g.skew_bps.unwrap() >= 60, "skew was {:?}", g.skew_bps);
}

#[test]
fn limits_refuse_small_large_and_over_window_conversions_with_their_own_reasons() {
    let mut c = guarded(RouteGuard {
        min_amount_in: U128(500_000),
        max_amount_in: U128(2_000_000),
        window_ms: 60_000,
        max_window_amount_in: U128(2_500_000),
        ..guard(0)
    });
    at_parity(&mut c);
    let quote = |amount: u128| {
        let a = compute_amounts(
            amount,
            crate::types::Ratio::normalised(U128(1000), U128(1)),
            10,
        )
        .unwrap();
        quote_msg(|q| {
            q.compatibility_version = 3;
            q.amount_in = U128(amount);
            q.amount_out_gross = U128(a.gross);
            q.fee = U128(a.fee);
            q.amount_out = U128(a.net);
        })
    };
    let reason = |c: &Contract, amount: u128| run(c, token_a(), alice(), amount, &quote(amount));
    assert_eq!(
        reason(&c, 499_999).unwrap_err().reason,
        RejectReason::AmountBelowMin
    );
    assert_eq!(
        reason(&c, 2_000_001).unwrap_err().reason,
        RejectReason::AmountAboveMax
    );
    assert!(reason(&c, 2_000_000).is_ok());
    let g = c.get_route_guards("tgold-a".into(), "tgold-b".into(), Some(U128(499_999)));
    assert!(g
        .checks
        .iter()
        .any(|x| x.name == "amount_limits" && !x.passed));
}

#[test]
fn an_executed_conversion_consumes_the_window_and_the_window_tumbles() {
    let mut c = guarded(RouteGuard {
        window_ms: 60_000,
        max_window_amount_in: U128(1_500_000),
        ..guard(0)
    });
    at_parity(&mut c);
    let msg = quote_at_fee(10);
    as_account_at(token_a(), 5_000);
    let first = c.ft_on_transfer(alice(), U128(AMOUNT_IN), msg.clone());
    assert!(matches!(first, PromiseOrValue::Promise(_)));
    // The nonce is used now, so the window state is asserted directly.
    let window = c.window_at("tgold-a:tgold-b", "tgold-a", &guard_of(&c), 5_000);
    assert_eq!(window.used.0, AMOUNT_IN);
    let later = c.window_at("tgold-a:tgold-b", "tgold-a", &guard_of(&c), 5_000 + 60_000);
    assert_eq!(
        later.used.0, 0,
        "a new window starts when the old one has run"
    );
    let near_end = c.window_at("tgold-a:tgold-b", "tgold-a", &guard_of(&c), 5_000 + 59_999);
    assert_eq!(near_end.used.0, AMOUNT_IN);
    assert_eq!(
        c.check_guard_limits("tgold-a", "tgold-b", 600_000),
        Err(RejectReason::WindowLimitExceeded)
    );
}

fn guard_of(c: &Contract) -> RouteGuard {
    c.get_route_guard("tgold-a".into(), "tgold-b".into())
        .unwrap()
}

#[test]
fn an_unguarded_pair_keeps_the_mvp_behaviour_whatever_the_prices_say() {
    let mut c = ready();
    with_publisher(&mut c);
    prices_deviate(&mut c, 4_000);
    assert!(run(&c, token_a(), alice(), AMOUNT_IN, &quote_msg(|_| {})).is_ok());
    let g = c.get_route_guards("tgold-a".into(), "tgold-b".into(), None);
    assert!(g.executable);
    assert_eq!(
        g.checks.iter().find(|x| x.name == "guard").unwrap().detail,
        "unguarded"
    );
}
