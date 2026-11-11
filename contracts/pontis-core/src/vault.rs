//! Controlled test vault (ADR 0008) and the NEP-141 receiver entry point (ADR 0007).
//!
//! Inventory is tracked per representation inside this contract. Only the owner can fund it, by
//! `ft_transfer_call` with `msg = "fund_vault"`. Everything the receiver does not accept is
//! returned in full (the unused amount), so the token refunds the sender.

use crate::conversion::{ConversionRecord, Rejection};
use crate::events::CoreEvent;
use crate::quote::parse_nonce;
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{
    env, ext_contract, near, AccountId, Gas, NearToken, Promise, PromiseError, PromiseOrValue,
};

pub const FUND_VAULT_MSG: &str = "fund_vault";
/// Gas reserved for the token `ft_transfer` payout and for this contract's callback. The sandbox
/// burns about 1 and 2 Tgas for them (`integration-tests/tests/gas.rs`); these leave headroom.
pub const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
pub const GAS_CALLBACK: Gas = Gas::from_tgas(15);

#[ext_contract(ext_ft)]
#[allow(dead_code)] // only the generated `ext_ft` caller is used
pub trait ExtFungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near]
impl Contract {
    /// NEP-141 receiver. Returns the unused amount; `0` means everything was accepted.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let Some(rep_id) = self.representation_by_account.get(&token).cloned() else {
            return self.refuse(RejectReason::UnknownToken, None, sender_id, token, amount);
        };
        if msg == FUND_VAULT_MSG {
            return match self.fund_vault(&rep_id, &sender_id, amount) {
                Ok(()) => PromiseOrValue::Value(U128(0)),
                Err(reason) => self.refuse(reason, None, sender_id, token, amount),
            };
        }
        match self.validate_conversion(&token, &sender_id, amount, &msg) {
            Ok(plan) => self.execute_conversion(plan),
            Err(Rejection {
                reason,
                nonce,
                price_pair,
            }) => {
                if let Some((from_id, to_id)) = price_pair {
                    self.record_deviation_refusal(&from_id, &to_id);
                }
                self.refuse(reason, nonce, sender_id, token, amount)
            }
        }
    }

    pub fn get_inventory(&self, representation_id: String) -> U128 {
        U128(self.inventory.get(&representation_id).copied().unwrap_or(0))
    }

    /// Input tokens held for conversions whose payout has not resolved. They are in the token
    /// balance of this contract but are not spendable inventory.
    pub fn get_pending_inbound(&self, representation_id: String) -> U128 {
        U128(self.pending_inbound_of(&representation_id))
    }

    /// The conversion awaiting its payout result, if any. `nonce` is the 32-hex-character quote nonce.
    pub fn get_pending_conversion(&self, nonce: String) -> Option<ConversionRecord> {
        let nonce = parse_nonce(&nonce)?;
        self.pending_conversions.get(&nonce).cloned()
    }
}

impl Contract {
    /// Emits `conversion_rejected` and returns the whole amount so the token refunds the sender.
    pub(crate) fn refuse(
        &self,
        reason: RejectReason,
        nonce: Option<String>,
        sender_id: AccountId,
        token: AccountId,
        amount: U128,
    ) -> PromiseOrValue<U128> {
        CoreEvent::ConversionRejected {
            reason,
            sender_id,
            token,
            amount,
            nonce,
            timestamp_ms: now_ms(),
        }
        .emit();
        PromiseOrValue::Value(amount)
    }

    fn fund_vault(
        &mut self,
        rep_id: &str,
        sender_id: &AccountId,
        amount: U128,
    ) -> Result<(), RejectReason> {
        if *sender_id != self.owner_id {
            return Err(RejectReason::NotOwner);
        }
        // Neither the spendable total nor what a settling conversion will add may overflow.
        self.accounted_of(rep_id)
            .and_then(|total| total.checked_add(amount.0))
            .ok_or(RejectReason::InventoryOverflow)?;
        self.credit_inventory(rep_id, amount.0);
        let inventory = self.get_inventory(rep_id.to_string()).0;
        CoreEvent::VaultFunded {
            representation_id: rep_id.to_string(),
            amount,
            by: sender_id.clone(),
            inventory: U128(inventory),
            timestamp_ms: now_ms(),
        }
        .emit();
        Ok(())
    }

    pub(crate) fn pending_inbound_of(&self, rep_id: &str) -> u128 {
        self.pending_inbound.get(rep_id).copied().unwrap_or(0)
    }

    /// Spendable inventory plus pending input: every token this contract accounts for. `None`
    /// on overflow.
    pub(crate) fn accounted_of(&self, rep_id: &str) -> Option<u128> {
        self.get_inventory(rep_id.to_string())
            .0
            .checked_add(self.pending_inbound_of(rep_id))
    }

    /// Adds to spendable inventory. Callers have already ruled overflow out (`accounted_of`),
    /// so an overflow here is a broken invariant and aborts instead of saturating.
    pub(crate) fn credit_inventory(&mut self, rep_id: &str, amount: u128) {
        let inventory = self
            .get_inventory(rep_id.to_string())
            .0
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("inventory overflow"));
        self.inventory.insert(rep_id.to_string(), inventory);
        self.raise_inventory_reference(rep_id);
    }

    /// Removes from spendable inventory. Underflow is a broken invariant and aborts.
    pub(crate) fn debit_inventory(&mut self, rep_id: &str, amount: u128) {
        let inventory = self
            .get_inventory(rep_id.to_string())
            .0
            .checked_sub(amount)
            .unwrap_or_else(|| env::panic_str("inventory underflow"));
        self.inventory.insert(rep_id.to_string(), inventory);
    }

    /// Moves `amount` into the pending-input counter for `rep_id`.
    pub(crate) fn add_pending_inbound(&mut self, rep_id: &str, amount: u128) {
        let pending = self
            .pending_inbound_of(rep_id)
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("pending inbound overflow"));
        self.pending_inbound.insert(rep_id.to_string(), pending);
    }

    /// Releases `amount` from the pending-input counter for `rep_id`.
    pub(crate) fn release_pending_inbound(&mut self, rep_id: &str, amount: u128) {
        let pending = self
            .pending_inbound_of(rep_id)
            .checked_sub(amount)
            .unwrap_or_else(|| env::panic_str("pending inbound underflow"));
        self.pending_inbound.insert(rep_id.to_string(), pending);
    }
}

#[near]
impl Contract {
    /// Owner only. Debits inventory, then asks the token to pay `receiver_id`; the callback
    /// restores the inventory if the transfer fails.
    #[payable]
    pub fn withdraw_inventory(
        &mut self,
        representation_id: String,
        amount: U128,
        receiver_id: AccountId,
    ) -> Promise {
        self.assert_owner();
        check(amount.0 > 0, "amount must be positive");
        let token = self
            .representations
            .get(&representation_id)
            .unwrap_or_else(|| env::panic_str("representation not found"))
            .account_id
            .clone();
        let inventory = self.get_inventory(representation_id.clone()).0;
        check(inventory >= amount.0, "insufficient inventory");
        self.debit_inventory(&representation_id, amount.0);
        self.clamp_inventory_reference(&representation_id);
        ext_ft::ext(token)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(
                receiver_id.clone(),
                amount,
                Some("vault withdrawal".to_string()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_withdraw_resolved(representation_id, amount, receiver_id),
            )
    }

    /// Callback of `withdraw_inventory`. Returns whether the payout succeeded.
    #[private]
    pub fn on_withdraw_resolved(
        &mut self,
        representation_id: String,
        amount: U128,
        receiver_id: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let success = result.is_ok();
        if !success {
            self.credit_inventory(&representation_id, amount.0);
        }
        CoreEvent::VaultWithdrawn {
            representation_id,
            amount,
            receiver_id,
            success,
            timestamp_ms: now_ms(),
        }
        .emit();
        success
    }
}
