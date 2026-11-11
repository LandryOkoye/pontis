use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn as_account(who: &str) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(account("token.testnet"))
        .predecessor_account_id(account(who))
        .attached_deposit(NearToken::from_yoctonear(1))
        .block_timestamp(5_000_000_000)
        .build());
}

/// A token whose minter is `core.testnet`, with `alice` and the core registered.
fn gated() -> Contract {
    as_account("owner.testnet");
    let mut c = Contract::new(
        account("owner.testnet"),
        "SYNTHETIC TEST Gold A".to_string(),
        "TGOLD-A".to_string(),
        6,
        None,
        None,
    );
    for who in ["alice.testnet", "core.testnet"] {
        testing_env!(VMContextBuilder::new()
            .current_account_id(account("token.testnet"))
            .predecessor_account_id(account(who))
            .attached_deposit(NearToken::from_near(1))
            .build());
        c.storage_deposit(Some(account(who)), Some(true));
    }
    as_account("owner.testnet");
    c.set_minter(Some(account("core.testnet")));
    c
}

fn balance(c: &Contract, who: &str) -> u128 {
    c.ft_balance_of(account(who)).0
}

#[test]
fn the_minter_mints_and_the_event_names_it() {
    let mut c = gated();
    assert_eq!(c.get_minter(), Some(account("core.testnet")));
    as_account("core.testnet");
    c.minter_mint(account("alice.testnet"), U128(7));
    assert_eq!(balance(&c, "alice.testnet"), 7);
    assert_eq!(c.ft_total_supply().0, 7);
    assert!(near_sdk::test_utils::get_logs()
        .iter()
        .any(|l| l.contains("ft_mint") && l.contains("minter mint")));
}

#[test]
#[should_panic(expected = "only the minter can call this method")]
fn the_owner_is_not_the_minter() {
    let mut c = gated();
    as_account("owner.testnet");
    c.minter_mint(account("alice.testnet"), U128(1));
}

#[test]
#[should_panic(expected = "minting is gated by the minter")]
fn the_owner_mint_is_closed_while_a_minter_is_set() {
    let mut c = gated();
    as_account("owner.testnet");
    c.mint(account("alice.testnet"), U128(1));
}

#[test]
#[should_panic(expected = "minting is gated by the minter")]
fn the_faucet_is_closed_while_a_minter_is_set() {
    let mut c = gated();
    as_account("alice.testnet");
    c.faucet_mint(U128(1));
}

#[test]
fn clearing_the_minter_reopens_the_owner_mint() {
    let mut c = gated();
    as_account("owner.testnet");
    c.set_minter(None);
    assert_eq!(c.get_minter(), None);
    c.mint(account("alice.testnet"), U128(5));
    assert_eq!(balance(&c, "alice.testnet"), 5);
}

#[test]
#[should_panic(expected = "only the owner can call this method")]
fn only_the_owner_sets_the_minter() {
    let mut c = gated();
    as_account("alice.testnet");
    c.set_minter(Some(account("alice.testnet")));
}

#[test]
fn the_minter_burns_only_its_own_balance() {
    let mut c = gated();
    as_account("core.testnet");
    c.minter_mint(account("core.testnet"), U128(10));
    c.minter_mint(account("alice.testnet"), U128(4));
    c.minter_burn(U128(6));
    assert_eq!(balance(&c, "core.testnet"), 4);
    assert_eq!(
        balance(&c, "alice.testnet"),
        4,
        "no other balance is touched"
    );
    assert_eq!(c.ft_total_supply().0, 8);
}

#[test]
#[should_panic(expected = "The account doesn't have enough balance")]
fn the_minter_cannot_burn_more_than_it_holds() {
    let mut c = gated();
    as_account("core.testnet");
    c.minter_mint(account("alice.testnet"), U128(4));
    c.minter_burn(U128(1));
}

#[test]
#[should_panic(expected = "token is paused")]
fn minting_stops_while_the_token_is_paused() {
    let mut c = gated();
    as_account("owner.testnet");
    c.pause();
    as_account("core.testnet");
    c.minter_mint(account("alice.testnet"), U128(1));
}
