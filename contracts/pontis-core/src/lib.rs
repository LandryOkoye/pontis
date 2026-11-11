//! Pontis core protocol contract (ADR 0002): one contract, internal modules.
//!
//! Modules: `roles` (roles, pause, ownership), `registry` (issuers, canonical assets,
//! representations, evidence), `types` (record types, validation), `events` (NEP-297). Every state-changing method requires exactly
//! 1 yoctoNEAR (so restricted access keys cannot call it), checks the caller's role and the
//! pause state, and emits an event.

mod action_index;
mod action_route;
mod action_views;
mod actions;
mod actions_apply;
mod actions_events;
mod actions_types;
mod breaker;
mod breaker_reset;
mod compatibility;
mod config;
mod conversion;
mod epochs;
mod events;
mod guard;
mod guard_exec;
mod guard_math;
mod lifecycle;
mod lifecycle_route;
mod lifecycle_types;
mod math;
mod nav;
mod policy;
mod price;
mod quote;
mod registry;
mod roles;
mod route;
mod route_guards;
mod route_guards_actions;
mod types;
mod vault;
mod wide;

pub use actions_events::ActionEvent;
pub use actions_types::*;
pub use conversion::{ConversionPlan, ConversionRecord, Rejection};
pub use events::{CoreEvent, PauseScope, RoleName};
pub use guard::{RouteGuard, StalePolicy};
pub use lifecycle_types::*;
pub use math::{compute_amounts, Amounts, MAX_FEE_BPS};
pub use nav::{NavAttestation, NavStrike, NAV_DOMAIN, NAV_VERSION};
pub use price::{PriceAttestation, PriceRecord};
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
    PricePublishers,
    Prices,
    Guards,
    Breakers,
    Windows,
    InventoryRef,
    PairsByRep,
    CorporateActions,
    ActionsByAsset,
    OpenActions,
    Epochs,
    RepsByAsset,
    RelsByRep,
    ApprovedMultipliers,
    Lifecycles,
    NavStrikes,
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
    /// ed25519 keys whose signatures `submit_price` accepts (ADR 0016).
    price_publishers: IterableSet<PublicKey>,
    /// Latest accepted price per representation ID.
    prices: LookupMap<String, price::PriceRecord>,
    /// Route guard per pair key; absent means unguarded (the MVP behaviour).
    guards: LookupMap<String, guard::RouteGuard>,
    breakers: LookupMap<String, breaker::BreakerState>,
    /// Tumbling window usage, keyed `"{pair}|{from_id}"`.
    windows: LookupMap<String, guard::WindowState>,
    /// Peak spendable inventory per representation, the denominator of the fee skew.
    inventory_ref: LookupMap<String, u128>,
    /// Pair keys of the guarded relationships each representation takes part in.
    pairs_by_rep: LookupMap<String, Vec<String>>,
    /// Corporate actions by ID (ADR 0017).
    corporate_actions: LookupMap<String, actions_types::CorporateAction>,
    /// Every action ID of an asset, oldest first; its length numbers the next one.
    actions_by_asset: LookupMap<String, Vec<String>>,
    /// The proposed and approved action IDs of an asset: all a route check has to read.
    open_actions: LookupMap<String, Vec<String>>,
    /// Multiplier schedule per representation; the first epoch is the registration multiplier.
    epochs: LookupMap<String, Vec<actions_types::MultiplierEpoch>>,
    reps_by_asset: LookupMap<String, Vec<String>>,
    /// Pair keys of every relationship a representation takes part in.
    rels_by_rep: LookupMap<String, Vec<String>>,
    /// The multipliers `(a, b)` a relationship was last approved on, by pair key.
    approved_multipliers: LookupMap<String, (Ratio, Ratio)>,
    /// Lifecycle side record per representation; absent means fungible and active (ADR 0018).
    lifecycles: LookupMap<String, lifecycle_types::Lifecycle>,
    nav_strikes: LookupMap<String, nav::NavStrike>,
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
            price_publishers: IterableSet::new(StorageKey::PricePublishers),
            prices: LookupMap::new(StorageKey::Prices),
            guards: LookupMap::new(StorageKey::Guards),
            breakers: LookupMap::new(StorageKey::Breakers),
            windows: LookupMap::new(StorageKey::Windows),
            inventory_ref: LookupMap::new(StorageKey::InventoryRef),
            pairs_by_rep: LookupMap::new(StorageKey::PairsByRep),
            corporate_actions: LookupMap::new(StorageKey::CorporateActions),
            actions_by_asset: LookupMap::new(StorageKey::ActionsByAsset),
            open_actions: LookupMap::new(StorageKey::OpenActions),
            epochs: LookupMap::new(StorageKey::Epochs),
            reps_by_asset: LookupMap::new(StorageKey::RepsByAsset),
            rels_by_rep: LookupMap::new(StorageKey::RelsByRep),
            approved_multipliers: LookupMap::new(StorageKey::ApprovedMultipliers),
            lifecycles: LookupMap::new(StorageKey::Lifecycles),
            nav_strikes: LookupMap::new(StorageKey::NavStrikes),
        }
    }
}

pub(crate) fn now_ms() -> u64 {
    env::block_timestamp() / 1_000_000
}

#[cfg(test)]
mod action_rebase_tests;
#[cfg(test)]
mod action_route_tests;
#[cfg(test)]
mod actions_apply_tests;
#[cfg(test)]
mod actions_review_tests;
#[cfg(test)]
mod actions_settle_tests;
#[cfg(test)]
mod actions_tests;
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
mod epochs_tests;
#[cfg(test)]
mod guard_breaker_tests;
#[cfg(test)]
mod guard_fee_tests;
#[cfg(test)]
mod guard_limits_tests;
#[cfg(test)]
mod guard_math_tests;
#[cfg(test)]
mod guard_route_tests;
#[cfg(test)]
mod guard_vector_tests;
#[cfg(test)]
mod lifecycle_delist_tests;
#[cfg(test)]
mod lifecycle_tests;
#[cfg(test)]
mod math_tests;
#[cfg(test)]
mod nav_submit_tests;
#[cfg(test)]
mod nav_tests;
#[cfg(test)]
mod nav_vector_tests;
#[cfg(test)]
mod policy_tests;
#[cfg(test)]
mod price_submit_tests;
#[cfg(test)]
mod price_tests;
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
