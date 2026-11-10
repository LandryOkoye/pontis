//! Pontis core protocol contract (ADR 0002): one contract, internal modules.
//!
//! Modules: `roles` (roles, pause, ownership), `registry` (issuers, canonical assets,
//! representations, evidence), `types` (record types, validation), `events` (NEP-297). Every state-changing method requires exactly
//! 1 yoctoNEAR (so restricted access keys cannot call it), checks the caller's role and the
//! pause state, and emits an event.

mod compatibility;
mod config;
mod conversion;
mod events;
mod math;
mod policy;
mod quote;
mod registry;
mod roles;
mod route;
mod types;
mod vault;

pub use conversion::{ConversionPlan, ConversionRecord, Rejection};
pub use events::{CoreEvent, PauseScope, RoleName};
pub use math::{compute_amounts, Amounts, MAX_FEE_BPS};
pub use quote::{parse_nonce, ConversionMsg, QuoteInput, QUOTE_DOMAIN, QUOTE_VERSION};
pub use route::{RouteRefusal, RouteTerms, RouteView};
pub use types::*;

use near_sdk::store::{IterableMap, IterableSet, LookupMap, LookupSet};
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault, PublicKey};

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
    AllowlistRequired,
    Allowlist,
    Inventory,
    UsedNonces,
    PendingConversions,
    PendingInbound,
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
    /// Global policy version; moves on rule changes only (ADR 0004). Starts at 1.
    policy_version: u64,
    /// Per-representation override; absent means the default, `true`.
    allowlist_required: LookupMap<String, bool>,
    allowlist: LookupSet<(String, AccountId)>,
    /// ed25519 key that signs quotes (ADR 0006); unset until the owner sets it.
    quote_signer: Option<PublicKey>,
    /// `protocol_fee_bps`, capped at 100.
    fee_bps: u16,
    /// Spendable vault inventory per representation ID, in smallest units (ADR 0008). Never
    /// includes an input whose conversion has not settled, and excludes amounts reserved for an
    /// in-flight output or withdrawal.
    inventory: LookupMap<String, u128>,
    /// Quote nonces already executed or attempted to completion; never pruned (ADR 0006).
    used_nonces: LookupSet<[u8; 16]>,
    /// Conversions whose payout has not resolved, by nonce (ADR 0007). Present from
    /// `execute_conversion` until `on_payout_resolved` removes it, exactly once.
    pending_conversions: LookupMap<[u8; 16], ConversionRecord>,
    /// Input tokens held for pending conversions, per representation ID. Not spendable: they
    /// move to `inventory` on a successful payout and stay out of it on a failed one so the
    /// token's resolver can refund them to the sender.
    pending_inbound: LookupMap<String, u128>,
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
            policy_version: 1,
            allowlist_required: LookupMap::new(StorageKey::AllowlistRequired),
            allowlist: LookupSet::new(StorageKey::Allowlist),
            quote_signer: None,
            fee_bps: config::DEFAULT_FEE_BPS,
            inventory: LookupMap::new(StorageKey::Inventory),
            used_nonces: LookupSet::new(StorageKey::UsedNonces),
            pending_conversions: LookupMap::new(StorageKey::PendingConversions),
            pending_inbound: LookupMap::new(StorageKey::PendingInbound),
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
mod config_tests;
#[cfg(test)]
mod conversion_exec_tests;
#[cfg(test)]
mod conversion_state_tests;
#[cfg(test)]
mod conversion_tests;
#[cfg(test)]
mod math_tests;
#[cfg(test)]
mod policy_tests;
#[cfg(test)]
mod quote_tests;
#[cfg(test)]
mod registry_tests;
#[cfg(test)]
mod route_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod vault_tests;
