//! TEST FIXTURE ONLY. Never deployed outside the sandbox integration tests.
//!
//! A destination token whose payout (`ft_transfer`) does not resolve on its own: it yields the
//! promise and stays unresolved until a test calls `release`, either as a success or as a
//! failure. That holds a `pontis-core` conversion in its "payout pending" state for as long as
//! the test needs, so the tests can attempt a withdrawal or another conversion in exactly the
//! interval where the input is held but not yet settled, with no reliance on block timing.
//!
//! It keeps no balances. `ft_transfer_call` forwards to the receiver's `ft_on_transfer` as the
//! sender, which is all the tests need to fund the vault and to start a conversion from it.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, ext_contract, near, serde_json, AccountId, Gas, GasWeight, PanicOnDefault, Promise,
    PromiseError, YieldId,
};

#[ext_contract(ext_receiver)]
#[allow(dead_code)] // only the generated `ext_receiver` caller is used
pub trait ExtReceiver {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String);
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    /// Payouts waiting for `release`, by the account the payout is addressed to.
    held: LookupMap<AccountId, YieldId>,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            held: LookupMap::new(b"h".to_vec()),
        }
    }

    /// The payout `pontis-core` asks for. Held until `release(receiver_id, ..)`.
    #[payable]
    pub fn ft_transfer(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
    ) -> Promise {
        let _ = (amount, memo);
        if self.held.contains_key(&receiver_id) {
            env::panic_str("a payout to this account is already held");
        }
        let (promise, yield_id) =
            Promise::new_yield("on_released", vec![], Gas::from_tgas(5), GasWeight(0));
        self.held.insert(receiver_id, yield_id);
        promise
    }

    /// Resolves the held payout to `receiver_id`: it succeeds, or fails like an unregistered
    /// recipient would.
    pub fn release(&mut self, receiver_id: AccountId, succeed: bool) {
        let yield_id = self
            .held
            .remove(&receiver_id)
            .unwrap_or_else(|| env::panic_str("no held payout to this account"));
        yield_id
            .resume(serde_json::to_vec(&succeed).unwrap())
            .unwrap_or_else(|_| env::panic_str("the held payout already timed out"));
    }

    #[private]
    pub fn on_released(&mut self, #[callback_result] succeed: Result<bool, PromiseError>) {
        match succeed {
            Ok(true) => {}
            Ok(false) => env::panic_str("payout refused by the fixture"),
            Err(_) => env::panic_str("payout was never released"),
        }
    }

    pub fn is_held(&self, receiver_id: AccountId) -> bool {
        self.held.contains_key(&receiver_id)
    }

    /// Calls the receiver's `ft_on_transfer` as the sender. No balances, no refund.
    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        let _ = memo;
        ext_receiver::ext(receiver_id).ft_on_transfer(env::predecessor_account_id(), amount, msg)
    }
}
