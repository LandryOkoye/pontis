//! Minter role (ADR 0020 section 6): one account, set by the owner, that is the only way supply
//! grows while it is set. `pontis-core` is the minter of a reserve-gated token: it checks the
//! attested headroom, reserves the amount and then calls `minter_mint`. `minter_burn` burns from
//! the minter's own balance, which is the redemption escrow the core holds; no other balance can
//! be burned. While a minter is set the owner `mint` and the faucet are closed.

use super::*;

#[near]
impl Contract {
    /// Owner only. `None` clears the minter, which re-opens the owner mint and the faucet.
    #[payable]
    pub fn set_minter(&mut self, minter: Option<AccountId>) {
        self.assert_owner();
        self.minter = minter.clone();
        TokenEvent::MinterSet {
            by: self.owner_id.clone(),
            minter,
        }
        .emit();
    }

    /// Minter only. Mints to a registered account.
    #[payable]
    pub fn minter_mint(&mut self, account_id: AccountId, amount: U128) {
        self.assert_minter();
        self.assert_not_paused();
        require!(amount.0 > 0, "amount must be positive");
        self.mint_to(&account_id, amount, Some("minter mint"));
    }

    /// Minter only. Burns `amount` from the minter's own balance.
    #[payable]
    pub fn minter_burn(&mut self, amount: U128) {
        let minter = self.assert_minter();
        self.assert_not_paused();
        require!(amount.0 > 0, "amount must be positive");
        self.token.internal_withdraw(&minter, amount.0);
        FtBurn {
            owner_id: &minter,
            amount,
            memo: Some("minter burn"),
        }
        .emit();
    }

    pub fn get_minter(&self) -> Option<AccountId> {
        self.minter.clone()
    }
}

impl Contract {
    /// Requires 1 yoctoNEAR and the minter as caller. Returns the caller.
    fn assert_minter(&self) -> AccountId {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        require!(
            self.minter.as_ref() == Some(&caller),
            "only the minter can call this method"
        );
        caller
    }

    /// The owner mint and the faucet are closed while a minter is set.
    pub(crate) fn assert_not_gated(&self) {
        require!(self.minter.is_none(), "minting is gated by the minter");
    }
}
