//! Pontis core protocol contract (ADR 0002): one contract, internal modules.
//!
//! This module set currently covers roles, pause controls and ownership (`roles`). Registry
//! records live in `types`; events in `events`. Every state-changing method requires exactly
//! 1 yoctoNEAR (so restricted access keys cannot call it), checks the caller's role and the
//! pause state, and emits an event.

mod events;
mod roles;
mod types;

pub use events::{CoreEvent, PauseScope, RoleName};
pub use types::*;

use near_sdk::store::IterableSet;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Registrars,
    CompatApprovers,
    Pausers,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    owner_id: AccountId,
    pending_owner: Option<AccountId>,
    paused: bool,
    registrars: IterableSet<AccountId>,
    compat_approvers: IterableSet<AccountId>,
    pausers: IterableSet<AccountId>,
}

#[near]
impl Contract {
    /// Deploys with `owner_id` as owner and no other role holders. The owner is not implicitly
    /// a registrar, approver or pauser (ADR 0003); grant roles explicitly.
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        types::check(!env::state_exists(), "Already initialized");
        Self {
            owner_id,
            pending_owner: None,
            paused: false,
            registrars: IterableSet::new(StorageKey::Registrars),
            compat_approvers: IterableSet::new(StorageKey::CompatApprovers),
            pausers: IterableSet::new(StorageKey::Pausers),
        }
    }
}

#[cfg(test)]
mod tests;
