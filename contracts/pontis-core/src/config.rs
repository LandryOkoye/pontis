//! Conversion configuration: the quote-signer public key and the protocol fee (ADR 0006).
//! Both are owner-only. Neither is blocked by the global pause, so the owner can rotate a
//! compromised signer while paused.

use crate::events::CoreEvent;
use crate::math::MAX_FEE_BPS;
use crate::types::check;
use crate::{Contract, ContractExt};
use near_sdk::{env, near, CurveType, PublicKey};

pub const DEFAULT_FEE_BPS: u16 = 10;

#[near]
impl Contract {
    /// Replaces the quote-signer key. There is no overlap window: quotes signed by the previous
    /// key stop verifying immediately. Only ed25519 keys are accepted.
    #[payable]
    pub fn set_quote_signer(&mut self, public_key: PublicKey) {
        self.assert_owner();
        check(
            public_key.curve_type() == CurveType::ED25519,
            "quote signer must be an ed25519 key",
        );
        self.quote_signer = Some(public_key.clone());
        CoreEvent::QuoteSignerSet {
            public_key: String::from(&public_key),
            by: env::predecessor_account_id(),
        }
        .emit();
    }

    /// Sets `protocol_fee_bps`, capped at 100 (1%). Existing quotes carry their own `fee_bps`
    /// and are rejected at execution if it no longer matches.
    #[payable]
    pub fn set_fee_bps(&mut self, fee_bps: u16) {
        self.assert_owner();
        check(fee_bps <= MAX_FEE_BPS, "fee_bps exceeds the 100 bps cap");
        self.fee_bps = fee_bps;
        CoreEvent::FeeUpdated {
            fee_bps,
            by: env::predecessor_account_id(),
        }
        .emit();
    }

    pub fn get_quote_signer(&self) -> Option<PublicKey> {
        self.quote_signer.clone()
    }

    pub fn get_fee_bps(&self) -> u16 {
        self.fee_bps
    }
}
