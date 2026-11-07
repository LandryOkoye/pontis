//! Pontis `synthetic-token`: a SYNTHETIC TEST NEP-141 token for NEAR Testnet.
//!
//! The token is unbacked and has no value. It exists to exercise the Pontis registry and
//! conversion flow (ADR 0001, ADR 0002). It knows nothing about `pontis-core`.
//!
//! Admin surface (all owner-only, 1 yoctoNEAR required, evented):
//! - `mint(account_id, amount)`: the registered recipient receives new supply.
//! - `burn(amount)`: burns from the owner's own balance only. There is no clawback.
//! - `pause` / `unpause`: while paused, no balance or supply moves: `ft_transfer`,
//!   `ft_transfer_call`, `mint`, `burn` and `faucet_mint` all fail. `ft_resolve_transfer` is
//!   unaffected, so refunds of in-flight `ft_transfer_call`s still complete.
//! - `set_faucet_config`: enables or disables the testnet faucet and sets its limits.
//!
//! Faucet: `faucet_mint(amount)` mints to the caller, up to `max_per_call`, once per
//! `cooldown_ms` per account. The caller must already be registered (`storage_deposit`).

mod events;

use events::TokenEvent;
use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault,
    PromiseOrValue,
};

/// Every metadata name must carry this marker so wallets and explorers show it (BuildPlan B4).
pub const SYNTHETIC_MARKER: &str = "SYNTHETIC TEST";
/// Same upper bound as `@pontis/domain` (10^38 fits in u128).
pub const MAX_DECIMALS: u8 = 38;
const DEFAULT_FAUCET_WHOLE_TOKENS: u128 = 100;
const DEFAULT_FAUCET_COOLDOWN_MS: u64 = 60 * 60 * 1000;

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Accounts,
    FaucetLastMint,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct FaucetConfig {
    pub enabled: bool,
    /// Maximum amount (smallest units) per `faucet_mint` call.
    pub max_per_call: U128,
    /// Minimum time between two faucet mints by the same account.
    pub cooldown_ms: u64,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
    owner_id: AccountId,
    paused: bool,
    faucet: FaucetConfig,
    /// Last faucet mint time in ms, per account. Testnet only: entries are never pruned.
    faucet_last_mint_ms: LookupMap<AccountId, u64>,
}

#[near]
impl Contract {
    /// Deploys a token with zero supply. The owner is registered so it can hold minted supply.
    /// Faucet defaults: 100 whole tokens per call, one call per hour per account, enabled.
    #[init]
    pub fn new(
        owner_id: AccountId,
        name: String,
        symbol: String,
        decimals: u8,
        faucet_max_per_call: Option<U128>,
        faucet_cooldown_ms: Option<u64>,
    ) -> Self {
        require!(!env::state_exists(), "Already initialized");
        require!(
            name.contains(SYNTHETIC_MARKER),
            "name must contain \"SYNTHETIC TEST\""
        );
        require!(!symbol.is_empty(), "symbol must not be empty");
        require!(decimals <= MAX_DECIMALS, "decimals must be at most 38");

        let default_max = DEFAULT_FAUCET_WHOLE_TOKENS
            .checked_mul(10u128.pow(u32::from(decimals)))
            .unwrap_or_else(|| env::panic_str("default faucet cap overflows u128"));
        let max_per_call = faucet_max_per_call.unwrap_or(U128(default_max));
        require!(max_per_call.0 > 0, "faucet max_per_call must be positive");

        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name,
            symbol,
            icon: None,
            reference: None,
            reference_hash: None,
            decimals,
        };
        metadata.assert_valid();

        let mut token = FungibleToken::new(StorageKey::Accounts);
        token.internal_register_account(&owner_id);

        Self {
            token,
            metadata,
            owner_id,
            paused: false,
            faucet: FaucetConfig {
                enabled: true,
                max_per_call,
                cooldown_ms: faucet_cooldown_ms.unwrap_or(DEFAULT_FAUCET_COOLDOWN_MS),
            },
            faucet_last_mint_ms: LookupMap::new(StorageKey::FaucetLastMint),
        }
    }

    // ---- owner-only ----

    /// Mints `amount` to a registered account.
    #[payable]
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        self.assert_owner();
        self.assert_not_paused();
        require!(amount.0 > 0, "amount must be positive");
        self.mint_to(&account_id, amount, Some("owner mint"));
    }

    /// Burns `amount` from the owner's own balance.
    #[payable]
    pub fn burn(&mut self, amount: U128) {
        self.assert_owner();
        self.assert_not_paused();
        require!(amount.0 > 0, "amount must be positive");
        self.token
            .internal_withdraw(&self.owner_id.clone(), amount.0);
        FtBurn {
            owner_id: &self.owner_id,
            amount,
            memo: Some("owner burn"),
        }
        .emit();
    }

    #[payable]
    pub fn pause(&mut self) {
        self.assert_owner();
        require!(!self.paused, "already paused");
        self.paused = true;
        TokenEvent::Paused {
            by: self.owner_id.clone(),
        }
        .emit();
    }

    #[payable]
    pub fn unpause(&mut self) {
        self.assert_owner();
        require!(self.paused, "not paused");
        self.paused = false;
        TokenEvent::Unpaused {
            by: self.owner_id.clone(),
        }
        .emit();
    }

    /// Replaces the faucet configuration. `enabled = false` turns the faucet off.
    #[payable]
    pub fn set_faucet_config(&mut self, enabled: bool, max_per_call: U128, cooldown_ms: u64) {
        self.assert_owner();
        require!(max_per_call.0 > 0, "faucet max_per_call must be positive");
        self.faucet = FaucetConfig {
            enabled,
            max_per_call,
            cooldown_ms,
        };
        TokenEvent::FaucetConfigUpdated {
            by: self.owner_id.clone(),
            enabled,
            max_per_call,
            cooldown_ms,
        }
        .emit();
    }

    // ---- testnet faucet ----

    /// Mints `amount` to the caller. Testnet-only demo faucet; see module docs.
    pub fn faucet_mint(&mut self, amount: U128) {
        self.assert_not_paused();
        require!(self.faucet.enabled, "faucet is disabled");
        require!(amount.0 > 0, "amount must be positive");
        require!(
            amount.0 <= self.faucet.max_per_call.0,
            "amount exceeds faucet max_per_call"
        );
        let caller = env::predecessor_account_id();
        let now = now_ms();
        if let Some(next) = self.next_available_ms(&caller) {
            require!(now >= next, "faucet cooldown has not elapsed");
        }
        self.mint_to(&caller, amount, Some("faucet"));
        self.faucet_last_mint_ms.insert(&caller, &now);
        TokenEvent::FaucetMinted {
            account_id: caller,
            amount,
        }
        .emit();
    }

    // ---- views ----

    pub fn owner_id(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn faucet_config(&self) -> FaucetConfig {
        self.faucet.clone()
    }

    /// Earliest time (ms since epoch) the account may use the faucet again; 0 if it can now.
    pub fn faucet_next_available_ms(&self, account_id: AccountId) -> u64 {
        self.next_available_ms(&account_id).unwrap_or(0)
    }
}

impl Contract {
    fn assert_owner(&self) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner_id,
            "only the owner can call this method"
        );
    }

    fn assert_not_paused(&self) {
        require!(!self.paused, "token is paused");
    }

    fn mint_to(&mut self, account_id: &AccountId, amount: U128, memo: Option<&str>) {
        require!(
            self.token.accounts.contains_key(account_id),
            "recipient is not registered; call storage_deposit first"
        );
        self.token.internal_deposit(account_id, amount.0);
        FtMint {
            owner_id: account_id,
            amount,
            memo,
        }
        .emit();
    }

    fn next_available_ms(&self, account_id: &AccountId) -> Option<u64> {
        self.faucet_last_mint_ms
            .get(account_id)
            .map(|last| last.saturating_add(self.faucet.cooldown_ms))
    }
}

fn now_ms() -> u64 {
    env::block_timestamp() / 1_000_000
}

// NEP-141 core, delegated to the standard implementation with a pause gate on transfers.
#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.assert_not_paused();
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.assert_not_paused();
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        // Deliberately not pause-gated: refunds of in-flight transfers must complete.
        let (used_amount, burned_amount) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned_amount > 0 {
            FtBurn {
                owner_id: &sender_id,
                amount: U128(burned_amount),
                memo: Some("unregistered while transfer in flight"),
            }
            .emit();
        }
        used_amount.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        // `force` would burn the caller's balance; only allowed while not paused so that supply
        // never moves during a pause.
        if force.unwrap_or(false) {
            self.assert_not_paused();
        }
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            if balance > 0 {
                FtBurn {
                    owner_id: &account_id,
                    amount: U128(balance),
                    memo: Some("account unregistered"),
                }
                .emit();
            }
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }
}

#[cfg(test)]
mod tests;
