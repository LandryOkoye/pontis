//! NEP-297 events for the admin surface of the token. Transfers, mints and burns use the
//! standard NEP-141 events from `near-contract-standards`; these cover what NEP-141 does not.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[near(event_json(standard = "pontis_synthetic_token"))]
pub enum TokenEvent {
    #[event_version("1.0.0")]
    Paused { by: AccountId },
    #[event_version("1.0.0")]
    Unpaused { by: AccountId },
    #[event_version("1.0.0")]
    FaucetConfigUpdated {
        by: AccountId,
        enabled: bool,
        max_per_call: U128,
        cooldown_ms: u64,
    },
    #[event_version("1.0.0")]
    FaucetMinted { account_id: AccountId, amount: U128 },
}
