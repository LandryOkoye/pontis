use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const DECIMALS: u8 = 6;
const ONE_TOKEN: u128 = 1_000_000;
const MS: u64 = 1_000_000; // ns per ms

fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}
fn owner() -> AccountId {
    account("owner.testnet")
}
fn alice() -> AccountId {
    account("alice.testnet")
}
fn bob() -> AccountId {
    account("bob.testnet")
}
fn stranger() -> AccountId {
    account("stranger.testnet")
}

fn set_ctx(predecessor: AccountId, deposit: NearToken, now_ms: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(account("token.testnet"))
        .predecessor_account_id(predecessor)
        .attached_deposit(deposit)
        .block_timestamp(now_ms * MS)
        .build());
}

fn as_account(account: AccountId, now_ms: u64) {
    set_ctx(account, NearToken::from_yoctonear(0), now_ms);
}

/// Context for owner-only and transfer methods, which require exactly 1 yoctoNEAR.
fn as_account_1yocto(account: AccountId, now_ms: u64) {
    set_ctx(account, NearToken::from_yoctonear(1), now_ms);
}

fn new_token() -> Contract {
    as_account(owner(), 0);
    Contract::new(
        owner(),
        "SYNTHETIC TEST Gold A".to_string(),
        "TGOLD-A".to_string(),
        DECIMALS,
        None,
        None,
    )
}

fn register(c: &mut Contract, account: AccountId) {
    set_ctx(account.clone(), NearToken::from_near(1), 0);
    c.storage_deposit(Some(account), Some(true));
}

fn balance(c: &Contract, account: AccountId) -> u128 {
    c.ft_balance_of(account).0
}

fn mint(c: &mut Contract, to: AccountId, amount: u128) {
    as_account_1yocto(owner(), 0);
    c.mint(to, U128(amount));
}

// ---- initialisation and metadata ----

#[test]
fn metadata_is_marked_synthetic() {
    let c = new_token();
    let m = c.ft_metadata();
    assert!(m.name.contains(SYNTHETIC_MARKER));
    assert_eq!(m.symbol, "TGOLD-A");
    assert_eq!(m.decimals, DECIMALS);
    assert_eq!(m.spec, FT_METADATA_SPEC);
}

#[test]
#[should_panic(expected = "SYNTHETIC TEST")]
fn init_rejects_name_without_marker() {
    as_account(owner(), 0);
    Contract::new(
        owner(),
        "Gold A".to_string(),
        "TGOLD-A".to_string(),
        6,
        None,
        None,
    );
}

#[test]
#[should_panic(expected = "decimals must be at most 38")]
fn init_rejects_excess_decimals() {
    as_account(owner(), 0);
    Contract::new(
        owner(),
        "SYNTHETIC TEST X".to_string(),
        "X".to_string(),
        39,
        None,
        None,
    );
}

#[test]
fn starts_with_zero_supply_and_registered_owner() {
    let c = new_token();
    assert_eq!(c.ft_total_supply().0, 0);
    assert!(c.storage_balance_of(owner()).is_some());
    assert_eq!(c.owner_id(), owner());
    assert!(!c.is_paused());
}

#[test]
fn default_faucet_cap_is_100_whole_tokens() {
    let c = new_token();
    let f = c.faucet_config();
    assert!(f.enabled);
    assert_eq!(f.max_per_call.0, 100 * ONE_TOKEN);
    assert_eq!(f.cooldown_ms, DEFAULT_FAUCET_COOLDOWN_MS);
}

// ---- storage and transfers ----

#[test]
fn registered_accounts_can_transfer_and_supply_is_conserved() {
    let mut c = new_token();
    register(&mut c, alice());
    register(&mut c, bob());
    mint(&mut c, alice(), 5 * ONE_TOKEN);

    as_account_1yocto(alice(), 0);
    c.ft_transfer(bob(), U128(2 * ONE_TOKEN), None);

    assert_eq!(balance(&c, alice()), 3 * ONE_TOKEN);
    assert_eq!(balance(&c, bob()), 2 * ONE_TOKEN);
    assert_eq!(c.ft_total_supply().0, 5 * ONE_TOKEN);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn transfer_requires_one_yocto() {
    let mut c = new_token();
    register(&mut c, alice());
    register(&mut c, bob());
    mint(&mut c, alice(), ONE_TOKEN);
    as_account(alice(), 0);
    c.ft_transfer(bob(), U128(1), None);
}

#[test]
#[should_panic(expected = "is not registered")]
fn transfer_to_unregistered_account_fails() {
    let mut c = new_token();
    register(&mut c, alice());
    mint(&mut c, alice(), ONE_TOKEN);
    as_account_1yocto(alice(), 0);
    c.ft_transfer(bob(), U128(1), None);
}

#[test]
#[should_panic(expected = "The account doesn't have enough balance")]
fn transfer_more_than_balance_fails() {
    let mut c = new_token();
    register(&mut c, alice());
    register(&mut c, bob());
    mint(&mut c, alice(), 10);
    as_account_1yocto(alice(), 0);
    c.ft_transfer(bob(), U128(11), None);
}

#[test]
fn storage_deposit_registers_account_with_zero_balance() {
    let mut c = new_token();
    assert!(c.storage_balance_of(alice()).is_none());
    register(&mut c, alice());
    assert!(c.storage_balance_of(alice()).is_some());
    assert_eq!(balance(&c, alice()), 0);
}

// ---- owner mint / burn ----

#[test]
#[should_panic(expected = "only the owner")]
fn non_owner_cannot_mint() {
    let mut c = new_token();
    register(&mut c, alice());
    as_account_1yocto(alice(), 0);
    c.mint(alice(), U128(1));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn owner_mint_requires_one_yocto() {
    let mut c = new_token();
    register(&mut c, alice());
    as_account(owner(), 0);
    c.mint(alice(), U128(1));
}

#[test]
#[should_panic(expected = "recipient is not registered")]
fn mint_to_unregistered_account_fails() {
    let mut c = new_token();
    mint(&mut c, alice(), 1);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn mint_zero_fails() {
    let mut c = new_token();
    mint(&mut c, owner(), 0);
}

#[test]
fn owner_mint_increases_balance_and_supply() {
    let mut c = new_token();
    mint(&mut c, owner(), 7 * ONE_TOKEN);
    assert_eq!(balance(&c, owner()), 7 * ONE_TOKEN);
    assert_eq!(c.ft_total_supply().0, 7 * ONE_TOKEN);
}

#[test]
fn owner_burns_only_from_own_balance() {
    let mut c = new_token();
    register(&mut c, alice());
    mint(&mut c, owner(), 10);
    mint(&mut c, alice(), 4);
    as_account_1yocto(owner(), 0);
    c.burn(U128(6));
    assert_eq!(balance(&c, owner()), 4);
    assert_eq!(
        balance(&c, alice()),
        4,
        "burn has no way to touch other accounts"
    );
    assert_eq!(c.ft_total_supply().0, 8);
}

#[test]
#[should_panic(expected = "The account doesn't have enough balance")]
fn burn_more_than_owner_balance_fails() {
    let mut c = new_token();
    register(&mut c, alice());
    mint(&mut c, alice(), 100);
    mint(&mut c, owner(), 1);
    as_account_1yocto(owner(), 0);
    c.burn(U128(2));
}

#[test]
#[should_panic(expected = "only the owner")]
fn non_owner_cannot_burn() {
    let mut c = new_token();
    as_account_1yocto(alice(), 0);
    c.burn(U128(1));
}

// ---- faucet ----

fn faucet_token() -> Contract {
    let mut c = new_token();
    register(&mut c, alice());
    register(&mut c, bob());
    as_account_1yocto(owner(), 0);
    c.set_faucet_config(true, U128(50), 10_000);
    c
}

#[test]
fn faucet_mints_up_to_the_cap() {
    let mut c = faucet_token();
    as_account(alice(), 1_000);
    c.faucet_mint(U128(50));
    assert_eq!(balance(&c, alice()), 50);
    assert_eq!(c.ft_total_supply().0, 50);
}

#[test]
#[should_panic(expected = "exceeds faucet max_per_call")]
fn faucet_rejects_amount_above_cap() {
    let mut c = faucet_token();
    as_account(alice(), 1_000);
    c.faucet_mint(U128(51));
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn faucet_rejects_zero() {
    let mut c = faucet_token();
    as_account(alice(), 1_000);
    c.faucet_mint(U128(0));
}

#[test]
#[should_panic(expected = "cooldown has not elapsed")]
fn faucet_enforces_cooldown() {
    let mut c = faucet_token();
    as_account(alice(), 1_000);
    c.faucet_mint(U128(10));
    as_account(alice(), 1_000 + 9_999);
    c.faucet_mint(U128(10));
}

#[test]
fn faucet_cooldown_boundary_is_inclusive_and_per_account() {
    let mut c = faucet_token();
    as_account(alice(), 1_000);
    c.faucet_mint(U128(10));
    assert_eq!(c.faucet_next_available_ms(alice()), 11_000);
    assert_eq!(c.faucet_next_available_ms(bob()), 0);

    as_account(bob(), 1_001); // another account is unaffected by alice's cooldown
    c.faucet_mint(U128(10));

    as_account(alice(), 11_000); // exactly cooldown later
    c.faucet_mint(U128(10));
    assert_eq!(balance(&c, alice()), 20);
    assert_eq!(balance(&c, bob()), 10);
}

#[test]
#[should_panic(expected = "faucet is disabled")]
fn owner_can_disable_the_faucet() {
    let mut c = faucet_token();
    as_account_1yocto(owner(), 0);
    c.set_faucet_config(false, U128(50), 10_000);
    as_account(alice(), 1_000);
    c.faucet_mint(U128(1));
}

#[test]
#[should_panic(expected = "recipient is not registered")]
fn faucet_requires_registered_caller() {
    let mut c = faucet_token();
    as_account(stranger(), 1_000);
    c.faucet_mint(U128(1));
}

#[test]
#[should_panic(expected = "only the owner")]
fn non_owner_cannot_configure_faucet() {
    let mut c = faucet_token();
    as_account_1yocto(alice(), 0);
    c.set_faucet_config(true, U128(u128::MAX), 0);
}

#[test]
#[should_panic(expected = "max_per_call must be positive")]
fn faucet_config_rejects_zero_cap() {
    let mut c = faucet_token();
    as_account_1yocto(owner(), 0);
    c.set_faucet_config(true, U128(0), 0);
}

// ---- pause ----

fn paused_token() -> Contract {
    let mut c = faucet_token();
    mint(&mut c, alice(), 100);
    as_account_1yocto(owner(), 0);
    c.pause();
    assert!(c.is_paused());
    c
}

#[test]
#[should_panic(expected = "token is paused")]
fn pause_blocks_transfers() {
    let mut c = paused_token();
    as_account_1yocto(alice(), 0);
    c.ft_transfer(bob(), U128(1), None);
}

#[test]
#[should_panic(expected = "token is paused")]
fn pause_blocks_transfer_call() {
    let mut c = paused_token();
    as_account_1yocto(alice(), 0);
    let _ = c.ft_transfer_call(bob(), U128(1), None, String::new());
}

#[test]
#[should_panic(expected = "token is paused")]
fn pause_blocks_mint() {
    let mut c = paused_token();
    mint(&mut c, alice(), 1);
}

#[test]
#[should_panic(expected = "token is paused")]
fn pause_blocks_burn() {
    let mut c = paused_token();
    as_account_1yocto(owner(), 0);
    c.burn(U128(1));
}

#[test]
#[should_panic(expected = "token is paused")]
fn pause_blocks_faucet() {
    let mut c = paused_token();
    as_account(alice(), 1_000);
    c.faucet_mint(U128(1));
}

#[test]
fn unpause_restores_transfers() {
    let mut c = paused_token();
    as_account_1yocto(owner(), 0);
    c.unpause();
    as_account_1yocto(alice(), 0);
    c.ft_transfer(bob(), U128(40), None);
    assert_eq!(balance(&c, bob()), 40);
}

#[test]
#[should_panic(expected = "only the owner")]
fn non_owner_cannot_pause() {
    let mut c = new_token();
    as_account_1yocto(alice(), 0);
    c.pause();
}

#[test]
#[should_panic(expected = "already paused")]
fn double_pause_fails() {
    let mut c = paused_token();
    as_account_1yocto(owner(), 0);
    c.pause();
}
