//! Controlled test vault (ADR 0008) and the NEP-141 receiver entry point (ADR 0007).
//!
//! Inventory is tracked per representation inside this contract. Only the owner can fund it, by
//! `ft_transfer_call` with `msg = "fund_vault"`. Everything the receiver does not accept is
//! returned in full (the unused amount), so the token refunds the sender.

use crate::events::CoreEvent;
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, PromiseOrValue};

pub const FUND_VAULT_MSG: &str = "fund_vault";

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
        let outcome = match self.representation_by_account.get(&token).cloned() {
            None => Err(RejectReason::UnknownToken),
            Some(rep_id) if msg == FUND_VAULT_MSG => self.fund_vault(&rep_id, &sender_id, amount),
            Some(_) => Err(RejectReason::InvalidMsg),
        };
        match outcome {
            Ok(()) => PromiseOrValue::Value(U128(0)),
            Err(reason) => {
                CoreEvent::ConversionRejected {
                    reason,
                    sender_id,
                    token,
                    amount,
                    nonce: None,
                    timestamp_ms: now_ms(),
                }
                .emit();
                PromiseOrValue::Value(amount)
            }
        }
    }

    pub fn get_inventory(&self, representation_id: String) -> U128 {
        U128(self.inventory.get(&representation_id).copied().unwrap_or(0))
    }
}

impl Contract {
    fn fund_vault(
        &mut self,
        rep_id: &str,
        sender_id: &AccountId,
        amount: U128,
    ) -> Result<(), RejectReason> {
        if *sender_id != self.owner_id {
            return Err(RejectReason::NotOwner);
        }
        let inventory = self.get_inventory(rep_id.to_string()).0;
        let inventory = inventory
            .checked_add(amount.0)
            .ok_or(RejectReason::InventoryOverflow)?;
        self.inventory.insert(rep_id.to_string(), inventory);
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
}
