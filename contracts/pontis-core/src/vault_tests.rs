use crate::compat_tests::two_reps;
use crate::registry_tests::{pauser, token_a, token_b};
use crate::tests::{account, alice, as_account, as_callback, last_event, owner};
use crate::vault::FUND_VAULT_MSG;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::test_utils::get_created_receipts;
use near_sdk::{AccountId, PromiseOrValue, PromiseResult};

pub(crate) fn unused(result: PromiseOrValue<U128>) -> u128 {
    match result {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("expected an immediate value"),
    }
}

/// Calls `ft_on_transfer` as the given token contract.
pub(crate) fn transfer_in(
    c: &mut Contract,
    token: AccountId,
    sender: AccountId,
    amount: u128,
    msg: &str,
) -> u128 {
    as_account(token);
    unused(c.ft_on_transfer(sender, U128(amount), msg.to_string()))
}

fn fund(c: &mut Contract, token: AccountId, amount: u128) -> u128 {
    transfer_in(c, token, owner(), amount, FUND_VAULT_MSG)
}

fn inventory(c: &Contract, rep: &str) -> u128 {
    c.get_inventory(rep.into()).0
}

#[test]
fn the_owner_funds_inventory_per_representation() {
    let mut c = two_reps();
    assert_eq!(fund(&mut c, token_a(), 5_000), 0, "everything accepted");
    assert_eq!(fund(&mut c, token_a(), 2_000), 0);
    assert_eq!(fund(&mut c, token_b(), 9), 0);
    assert_eq!(inventory(&c, "tgold-a"), 7_000);
    assert_eq!(inventory(&c, "tgold-b"), 9);
    assert_eq!(inventory(&c, "ghost"), 0);
    let e = last_event();
    assert_eq!(e["event"], "vault_funded");
    assert_eq!(e["data"]["representation_id"], "tgold-b");
    assert_eq!(e["data"]["amount"], "9");
    assert_eq!(e["data"]["inventory"], "9");
    assert_eq!(e["data"]["by"], "owner.testnet");
}

#[test]
fn funding_is_allowed_while_the_contract_is_paused() {
    let mut c = two_reps();
    as_account(pauser());
    c.pause();
    assert_eq!(fund(&mut c, token_a(), 1), 0);
}

#[test]
fn a_non_owner_cannot_fund_and_is_refunded_in_full() {
    let mut c = two_reps();
    assert_eq!(
        transfer_in(&mut c, token_a(), alice(), 777, FUND_VAULT_MSG),
        777
    );
    assert_eq!(inventory(&c, "tgold-a"), 0);
    let e = last_event();
    assert_eq!(e["event"], "conversion_rejected");
    assert_eq!(e["data"]["reason"], "NOT_OWNER");
    assert_eq!(e["data"]["amount"], "777");
}

#[test]
fn tokens_that_are_not_registered_representations_are_refunded() {
    let mut c = two_reps();
    let fake = account("fake-token.testnet");
    assert_eq!(transfer_in(&mut c, fake, owner(), 50, FUND_VAULT_MSG), 50);
    assert_eq!(last_event()["data"]["reason"], "UNKNOWN_TOKEN");
}

#[test]
fn an_unrecognised_message_is_refunded() {
    let mut c = two_reps();
    assert_eq!(transfer_in(&mut c, token_a(), owner(), 10, "hello"), 10);
    assert_eq!(last_event()["data"]["reason"], "INVALID_MSG");
}

#[test]
fn an_inventory_overflow_is_refused_rather_than_wrapping() {
    let mut c = two_reps();
    assert_eq!(fund(&mut c, token_a(), u128::MAX), 0);
    assert_eq!(fund(&mut c, token_a(), 1), 1);
    assert_eq!(last_event()["data"]["reason"], "INVENTORY_OVERFLOW");
    assert_eq!(inventory(&c, "tgold-a"), u128::MAX);
}

fn funded() -> Contract {
    let mut c = two_reps();
    fund(&mut c, token_a(), 1_000);
    as_account(owner());
    c
}

#[test]
fn a_withdrawal_debits_first_and_asks_the_token_to_pay() {
    let mut c = funded();
    let _ = c.withdraw_inventory("tgold-a".into(), U128(400), alice());
    assert_eq!(inventory(&c, "tgold-a"), 600);
    let receivers: Vec<String> = get_created_receipts()
        .iter()
        .map(|r| r.receiver_id.to_string())
        .collect();
    assert_eq!(
        receivers,
        [token_a().to_string(), "core.testnet".to_string()]
    );
}

#[test]
fn a_successful_payout_keeps_the_debit_and_emits_vault_withdrawn() {
    let mut c = funded();
    let _ = c.withdraw_inventory("tgold-a".into(), U128(400), alice());
    as_callback(PromiseResult::Successful(vec![]));
    assert!(c.on_withdraw_resolved("tgold-a".into(), U128(400), alice(), Ok(())));
    assert_eq!(inventory(&c, "tgold-a"), 600);
    let e = last_event();
    assert_eq!(e["event"], "vault_withdrawn");
    assert_eq!(e["data"]["success"], true);
}

#[test]
fn a_failed_payout_restores_the_inventory() {
    let mut c = funded();
    let _ = c.withdraw_inventory("tgold-a".into(), U128(400), alice());
    as_callback(PromiseResult::Failed);
    let failed = near_sdk::PromiseError::Failed;
    assert!(!c.on_withdraw_resolved("tgold-a".into(), U128(400), alice(), Err(failed)));
    assert_eq!(inventory(&c, "tgold-a"), 1_000);
    assert_eq!(last_event()["data"]["success"], false);
}

#[test]
#[should_panic(expected = "only the owner")]
fn only_the_owner_withdraws() {
    let mut c = funded();
    as_account(alice());
    let _ = c.withdraw_inventory("tgold-a".into(), U128(1), alice());
}

#[test]
#[should_panic(expected = "insufficient inventory")]
fn a_withdrawal_cannot_exceed_the_inventory() {
    let mut c = funded();
    let _ = c.withdraw_inventory("tgold-a".into(), U128(1_001), alice());
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn a_zero_withdrawal_is_refused() {
    let mut c = funded();
    let _ = c.withdraw_inventory("tgold-a".into(), U128(0), alice());
}

#[test]
fn a_user_calling_ft_on_transfer_directly_is_refunded_not_credited() {
    let mut c = two_reps();
    // predecessor is the owner's own account, not a registered token contract.
    assert_eq!(
        transfer_in(&mut c, owner(), owner(), 50, FUND_VAULT_MSG),
        50
    );
    assert_eq!(last_event()["data"]["reason"], "UNKNOWN_TOKEN");
    assert_eq!(inventory(&c, "tgold-a"), 0);
}
