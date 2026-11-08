use crate::conversion_tests::{quote_msg, ready};
use crate::registry_tests::{token_a, token_b};
use crate::tests::{alice, as_account, as_callback, last_event};
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

fn inventory(c: &Contract) -> (u128, u128) {
    (
        c.get_inventory("tgold-a".into()).0,
        c.get_inventory("tgold-b".into()).0,
    )
}

fn record(c: &Contract) -> ConversionRecord {
    let msg: ConversionMsg = serde_json::from_str(&quote_msg(|_| {})).unwrap();
    let plan = c.validate_conversion(&token_a(), &alice(), U128(AMOUNT_IN), &quote_msg(|_| {}));
    assert!(
        plan.is_err(),
        "the nonce is already used, so validation now refuses it"
    );
    ConversionRecord {
        nonce: msg.quote.nonce,
        user: alice(),
        from_id: "tgold-a".into(),
        to_id: "tgold-b".into(),
        token_in: token_a(),
        token_out: token_b(),
        amount_in: U128(AMOUNT_IN),
        amount_out_gross: U128(1_000_000_000),
        fee: U128(1_000_000),
        amount_out: U128(NET_OUT),
        ratio: Ratio {
            num: U128(1000),
            den: U128(1),
        },
        fee_bps: 10,
        compatibility_version: 2,
        policy_version: 1,
    }
}

#[test]
fn a_valid_conversion_moves_inventory_marks_the_nonce_and_schedules_the_payout() {
    let mut c = ready();
    let result = convert(&mut c, &quote_msg(|_| {}));
    assert!(matches!(result, PromiseOrValue::Promise(_)));
    drop(result); // a dropped promise is what schedules its receipts
    assert_eq!(inventory(&c), (AMOUNT_IN, FUNDED_B - NET_OUT));

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
        inventory(&c),
        (AMOUNT_IN, FUNDED_B - NET_OUT),
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
    assert_eq!(e["data"]["nonce"], "000102030405060708090a0b0c0d0e0f");
    assert_eq!(inventory(&c), before);
    assert!(calls().is_empty(), "no payout is scheduled for a rejection");
}

#[test]
fn a_successful_payout_emits_the_full_breakdown_and_refunds_nothing() {
    let mut c = ready();
    let _ = convert(&mut c, &quote_msg(|_| {}));
    let rec = record(&c);
    as_callback(PromiseResult::Successful(vec![]));
    assert_eq!(c.on_payout_resolved(rec, Ok(())).0, 0);
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
}

#[test]
fn a_failed_payout_restores_inventory_returns_the_input_and_keeps_the_nonce_used() {
    let mut c = ready();
    let msg = quote_msg(|_| {});
    let _ = convert(&mut c, &msg);
    let rec = record(&c);
    as_callback(PromiseResult::Failed);
    let refund = c.on_payout_resolved(rec, Err(PromiseError::Failed));
    assert_eq!(
        refund.0, AMOUNT_IN,
        "the whole input is returned to the token for refund"
    );
    assert_eq!(inventory(&c), (0, FUNDED_B));
    let e = last_event();
    assert_eq!(e["event"], "conversion_failed");
    assert_eq!(e["data"]["reason"], "PAYOUT_FAILED");

    // A failed conversion needs a new quote: replaying the same one is refused.
    assert_eq!(unused(convert(&mut c, &msg)), AMOUNT_IN);
    assert_eq!(last_event()["data"]["reason"], "NONCE_USED");
}
