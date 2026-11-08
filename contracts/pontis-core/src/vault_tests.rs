use crate::compat_tests::two_reps;
use crate::registry_tests::{pauser, token_a, token_b};
use crate::tests::{account, alice, as_account, last_event, owner};
use crate::vault::FUND_VAULT_MSG;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, PromiseOrValue};

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
