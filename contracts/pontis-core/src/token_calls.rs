//! Cross-contract calls to a token the core mints and burns through, and reads supply from.
//! `minter_mint` and `minter_burn` are `synthetic-token` methods (ADR 0020 section 6).

use near_sdk::json_types::U128;
use near_sdk::{ext_contract, AccountId, Gas};

/// Gas for a token `ft_total_supply` view and for the core callbacks of mint, burn and return.
pub const GAS_TOKEN_CALL: Gas = Gas::from_tgas(10);
pub const GAS_TOKEN_CALLBACK: Gas = Gas::from_tgas(15);

#[ext_contract(ext_token)]
#[allow(dead_code)] // only the generated `ext_token` caller is used
pub trait ExtToken {
    fn ft_total_supply(&self) -> U128;
    fn minter_mint(&mut self, account_id: AccountId, amount: U128);
    fn minter_burn(&mut self, amount: U128);
}
