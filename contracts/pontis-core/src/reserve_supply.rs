//! Supply the contract trusts (ADR 0020 section 4): a ledger of what the gate minted and
//! redemption burned, mint amounts reserved in flight, and the last `ft_total_supply` read.
//! `refresh_supply` is permissionless because its source is the token itself; no reporter can
//! tell the core that supply is lower than it is.

use crate::custody_events::CustodyEvent;
use crate::reserve_types::*;
use crate::token_calls::{ext_token, GAS_TOKEN_CALL, GAS_TOKEN_CALLBACK};
use crate::types::check;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, env, near, NearToken, Promise, PromiseError};

#[near]
impl Contract {
    /// Anyone may call (1 yocto, not blocked by the pause). Reads the token's total supply and
    /// stores it when the call returns.
    #[payable]
    pub fn refresh_supply(&mut self, representation_id: String) -> Promise {
        assert_one_yocto();
        let account = self
            .representations
            .get(&representation_id)
            .map(|r| r.account_id.clone())
            .unwrap_or_else(|| env::panic_str("representation not found"));
        ext_token::ext(account)
            .with_attached_deposit(NearToken::from_yoctonear(0))
            .with_static_gas(GAS_TOKEN_CALL)
            .ft_total_supply()
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_TOKEN_CALLBACK)
                    .on_supply_read(representation_id),
            )
    }

    /// Callback of `refresh_supply`. A failed read stores nothing and returns `false`.
    #[private]
    pub fn on_supply_read(
        &mut self,
        representation_id: String,
        #[callback_result] result: Result<U128, PromiseError>,
    ) -> bool {
        let Ok(supply) = result else {
            return false;
        };
        let now = now_ms();
        self.supply_read.insert(
            representation_id.clone(),
            SupplyReading {
                units: supply,
                as_of_ms: now,
            },
        );
        CustodyEvent::ReserveSupplyRead {
            representation_id: representation_id.clone(),
            supply,
            timestamp_ms: now,
        }
        .emit();
        self.refresh_reserve_state(&representation_id);
        true
    }

    pub fn get_supply(&self, representation_id: String) -> SupplyView {
        let ledger = self
            .supply_ledger
            .get(&representation_id)
            .copied()
            .unwrap_or(0);
        let pending = self
            .pending_mint
            .get(&representation_id)
            .copied()
            .unwrap_or(0);
        SupplyView {
            ledger: U128(ledger),
            pending: U128(pending),
            read: self.supply_read.get(&representation_id).copied(),
            circulating: U128(self.circulating_of(&representation_id).unwrap_or(u128::MAX)),
        }
    }
}

impl Contract {
    pub(crate) fn assert_supply_room(&self, rep_id: &str, amount: u128) {
        let ledger = self.supply_ledger.get(rep_id).copied().unwrap_or(0);
        let pending = self.pending_mint.get(rep_id).copied().unwrap_or(0);
        check(
            ledger
                .checked_add(pending)
                .and_then(|t| t.checked_add(amount))
                .is_some(),
            "supply would overflow",
        );
    }
}
