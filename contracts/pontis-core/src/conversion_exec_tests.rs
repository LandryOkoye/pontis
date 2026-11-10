use crate::conversion_tests::{quote_msg, ready};
use crate::registry_tests::{token_a, token_b};
use crate::tests::{alice, as_account, as_callback, last_event, owner};
use crate::vault::FUND_VAULT_MSG;
use crate::vault_tests::unused;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::mock::MockAction;
use near_sdk::serde_json::{self, Value};
use near_sdk::test_utils::get_created_receipts;
use near_sdk::{PromiseError, PromiseOrValue, PromiseResult};

const AMOUNT_IN: u128 = 1_000_000;
const NET_OUT: u128 = 999_000_000;
const FUNDED_B: u128 = 1_000_000_000_000;

/// `ft_transfer_call` from alice's TGOLD-A into the contract with the vector quote.
fn convert(c: &mut Contract, msg: &str) -> PromiseOrValue<U128> {
    as_account(token_a());
    c.ft_on_transfer(alice(), U128(AMOUNT_IN), msg.to_string())
}

/// (receiver, method, args) of every function call the contract scheduled.
fn calls() -> Vec<(String, String, Value)> {
    let mut out = vec![];
    for receipt in get_created_receipts() {
        for action in receipt.actions {
            if let MockAction::FunctionCallWeight {
                method_name, args, ..
            } = action
            {
                let args = serde_json::from_slice(&args).unwrap_or(Value::Null);
                let method = String::from_utf8(method_name).unwrap();
                out.push((receipt.receiver_id.to_string(), method, args));
            }
        }
    }
    out
}

/// The nonce of the vector quote.
const NONCE: &str = "000102030405060708090a0b0c0d0e0f";

/// Spendable inventory of (A, B).
fn inventory(c: &Contract) -> (u128, u128) {
    (
        c.get_inventory("tgold-a".into()).0,
        c.get_inventory("tgold-b".into()).0,
    )
}

fn pending_in(c: &Contract) -> (u128, u128) {
    (
        c.get_pending_inbound("tgold-a".into()).0,
        c.get_pending_inbound("tgold-b".into()).0,
    )
}

fn resolve(c: &mut Contract, ok: bool) -> u128 {
    if ok {
        as_callback(PromiseResult::Successful(vec![]));
        c.on_payout_resolved(NONCE.into(), Ok(())).0
    } else {
        as_callback(PromiseResult::Failed);
        c.on_payout_resolved(NONCE.into(), Err(PromiseError::Failed))
            .0
    }
}

#[test]
fn a_valid_conversion_holds_the_input_as_pending_reserves_the_output_and_schedules_the_payout() {
    let mut c = ready();
    let result = convert(&mut c, &quote_msg(|_| {}));
    assert!(matches!(result, PromiseOrValue::Promise(_)));
    drop(result); // a dropped promise is what schedules its receipts
    assert_eq!(
        inventory(&c),
        (0, FUNDED_B - NET_OUT),
        "the input is not spendable yet; the output is reserved"
    );
    assert_eq!(pending_in(&c), (AMOUNT_IN, 0));
    let pending = c.get_pending_conversion(NONCE.into()).unwrap();
    assert_eq!(
        (pending.amount_in.0, pending.amount_out.0),
        (AMOUNT_IN, NET_OUT)
    );

    let calls = calls();
    let payout = calls.iter().find(|(_, m, _)| m == "ft_transfer").unwrap();
    assert_eq!(
        payout.0,
        token_b().to_string(),
        "paid out by the destination token"
    );
    assert_eq!(payout.2["receiver_id"], "alice.testnet");
    assert_eq!(payout.2["amount"], NET_OUT.to_string());
    let callback = calls
        .iter()
        .find(|(_, m, _)| m == "on_payout_resolved")
        .unwrap();
    assert_eq!(callback.0, "core.testnet");
    assert_eq!(callback.2["nonce"], NONCE);
}

#[test]
fn a_quote_cannot_be_executed_twice() {
    let mut c = ready();
    let msg = quote_msg(|_| {});
    let _ = convert(&mut c, &msg);
    let second = unused(convert(&mut c, &msg));
    assert_eq!(second, AMOUNT_IN, "the replay is refunded in full");
    assert_eq!(last_event()["data"]["reason"], "NONCE_USED");
    assert_eq!(
        (inventory(&c), pending_in(&c)),
        ((0, FUNDED_B - NET_OUT), (AMOUNT_IN, 0)),
        "and moves nothing"
    );
}

#[test]
fn a_rejected_conversion_refunds_everything_and_changes_nothing() {
    let mut c = ready();
    let before = inventory(&c);
    let expired = quote_msg(|q| q.expires_at_ms = 1);
    assert_eq!(unused(convert(&mut c, &expired)), AMOUNT_IN);
    let e = last_event();
    assert_eq!(e["event"], "conversion_rejected");
    assert_eq!(e["data"]["reason"], "QUOTE_EXPIRED");
    assert_eq!(e["data"]["nonce"], NONCE);
    assert_eq!(inventory(&c), before);
    assert_eq!(pending_in(&c), (0, 0));
    assert!(calls().is_empty(), "no payout is scheduled for a rejection");
}

#[test]
fn a_successful_payout_commits_the_input_to_inventory_and_emits_the_full_breakdown() {
    let mut c = ready();
    let _ = convert(&mut c, &quote_msg(|_| {}));
    assert_eq!(resolve(&mut c, true), 0, "nothing is refunded");
    let e = last_event();
    assert_eq!(e["event"], "conversion_completed");
    let d = &e["data"];
    assert_eq!(d["amount_in"], "1000000");
    assert_eq!(d["amount_out_gross"], "1000000000");
    assert_eq!(d["fee"], "1000000");
    assert_eq!(d["amount_out"], "999000000");
    assert_eq!(d["ratio"]["num"], "1000");
    assert_eq!(
        (
            d["compatibility_version"].as_u64(),
            d["policy_version"].as_u64()
        ),
        (Some(2), Some(1))
    );
    assert_eq!(inventory(&c), (AMOUNT_IN, FUNDED_B - NET_OUT));
    assert_eq!(pending_in(&c), (0, 0));
    assert!(c.get_pending_conversion(NONCE.into()).is_none());
}

#[test]
fn a_failed_payout_releases_the_output_keeps_the_input_out_of_inventory_and_returns_it() {
    let mut c = ready();
    let msg = quote_msg(|_| {});
    let _ = convert(&mut c, &msg);
    assert_eq!(
        resolve(&mut c, false),
        AMOUNT_IN,
        "the whole input is returned to the token for refund"
    );
    assert_eq!(
        inventory(&c),
        (0, FUNDED_B),
        "the refunded input is never counted as inventory"
    );
    assert_eq!(pending_in(&c), (0, 0));
    let e = last_event();
    assert_eq!(e["event"], "conversion_failed");
    assert_eq!(e["data"]["reason"], "PAYOUT_FAILED");

    // A failed conversion needs a new quote: replaying the same one is refused.
    assert_eq!(unused(convert(&mut c, &msg)), AMOUNT_IN);
    assert_eq!(last_event()["data"]["reason"], "NONCE_USED");
}

#[test]
#[should_panic(expected = "no pending conversion")]
fn a_duplicate_callback_aborts_instead_of_settling_twice() {
    let mut c = ready();
    let _ = convert(&mut c, &quote_msg(|_| {}));
    assert_eq!(resolve(&mut c, true), 0);
    resolve(&mut c, true);
}

#[test]
#[should_panic(expected = "no pending conversion")]
fn a_callback_for_a_conversion_that_never_started_aborts() {
    let mut c = ready();
    resolve(&mut c, false);
}

#[test]
#[should_panic(expected = "invalid nonce")]
fn a_callback_with_a_malformed_nonce_aborts() {
    let mut c = ready();
    as_callback(PromiseResult::Successful(vec![]));
    c.on_payout_resolved("not-a-nonce".into(), Ok(()));
}

#[test]
fn a_conversion_input_that_would_overflow_the_accounted_total_is_refused() {
    let mut c = ready();
    // Fund A so that inventory + the incoming input cannot be represented.
    as_account(token_a());
    let funded = c.ft_on_transfer(
        owner(),
        U128(u128::MAX - AMOUNT_IN + 1),
        FUND_VAULT_MSG.into(),
    );
    assert_eq!(unused(funded), 0);
    assert_eq!(unused(convert(&mut c, &quote_msg(|_| {}))), AMOUNT_IN);
    assert_eq!(last_event()["data"]["reason"], "INVENTORY_OVERFLOW");
    assert_eq!(pending_in(&c), (0, 0));
}
