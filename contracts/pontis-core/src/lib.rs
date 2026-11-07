//! Pontis core protocol contract (ADR 0002): one contract, internal modules.
//!
//! Modules: `roles` (roles, pause, ownership), `registry` (issuers, canonical assets,
//! representations, evidence), `types` (record types, validation), `events` (NEP-297). Every state-changing method requires exactly
//! 1 yoctoNEAR (so restricted access keys cannot call it), checks the caller's role and the
//! pause state, and emits an event.

mod compatibility;
mod events;
mod registry;
mod roles;
mod types;

pub use events::{CoreEvent, PauseScope, RoleName};
pub use types::*;

use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Registrars,
    CompatApprovers,
    Pausers,
    Issuers,
    CanonicalAssets,
    Representations,
    RepresentationByAccount,
    Compatibilities,
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
    issuers: IterableMap<String, Issuer>,
    canonical_assets: IterableMap<String, CanonicalAsset>,
    representations: IterableMap<String, Representation>,
    /// Token contract account to representation ID; keeps accounts unique.
    representation_by_account: LookupMap<AccountId, String>,
    /// Keyed `"{a}:{b}"` with `a < b`.
    compatibilities: IterableMap<String, Compatibility>,
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
            issuers: IterableMap::new(StorageKey::Issuers),
            canonical_assets: IterableMap::new(StorageKey::CanonicalAssets),
            representations: IterableMap::new(StorageKey::Representations),
            representation_by_account: LookupMap::new(StorageKey::RepresentationByAccount),
            compatibilities: IterableMap::new(StorageKey::Compatibilities),
        }
    }
}

pub(crate) fn now_ms() -> u64 {
    env::block_timestamp() / 1_000_000
}

#[cfg(test)]
mod compat_lifecycle_tests;
#[cfg(test)]
mod compat_reject_tests;
#[cfg(test)]
mod compat_suspend_tests;
#[cfg(test)]
mod compat_tests;
#[cfg(test)]
mod registry_tests;
#[cfg(test)]
mod tests;
