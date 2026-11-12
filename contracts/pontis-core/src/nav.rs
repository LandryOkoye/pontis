//! NAV strikes (ADR 0018 section 4): a signed net asset value that opens a window
//! `[as_of_ms, cutoff_ms)` in which a `nav_fund` may convert. Same attestation conventions as
//! `price.rs`: a registered `price_publisher` key signs `b"pontis-nav-v1" ++ borsh(NavPayload)`
//! and the contract rebuilds the bytes from the JSON fields. `simulated` and `source` are stored
//! and echoed; the contract never acts on them. This phase has no pending conversions: a strike
//! is quotable only inside its own window and is the reference price of the fund.

use crate::actions_events::ActionEvent;
use crate::lifecycle_types::AssetKind;
use crate::price::{valid_currency, verify_ed25519, PriceRecord, MAX_FUTURE_SKEW_MS};
use crate::types::check;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{assert_one_yocto, env, near, AccountId, PublicKey};

pub const NAV_DOMAIN: &[u8] = b"pontis-nav-v1";
pub const NAV_VERSION: u8 = 1;
/// A window may be at most seven days long.
pub const MAX_STRIKE_INTERVAL_MS: u64 = 7 * 24 * 60 * 60 * 1000;

/// What a publisher signs, as it arrives in JSON.
#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct NavAttestation {
    pub version: u8,
    pub contract: AccountId,
    pub representation_id: String,
    /// Net asset value of one whole token at 8 decimals.
    pub nav: U128,
    pub currency: String,
    pub as_of_ms: u64,
    pub cutoff_ms: u64,
    pub simulated: bool,
    pub source: String,
}

/// The Borsh layout that is signed. Field order is part of the contract.
#[derive(Clone, Debug)]
#[near(serializers = [borsh])]
struct NavPayload {
    version: u8,
    contract: AccountId,
    representation_id: String,
    nav: u128,
    currency: String,
    as_of_ms: u64,
    cutoff_ms: u64,
    simulated: bool,
    source: String,
}

/// The latest accepted strike of a `nav_fund`.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct NavStrike {
    pub as_of_ms: u64,
    pub nav_per_unit: U128,
    pub cutoff_ms: u64,
    pub currency: String,
    pub source: String,
    pub simulated: bool,
    pub submitted_ms: u64,
    pub publisher_key: PublicKey,
}

impl NavAttestation {
    /// The exact bytes a publisher signs.
    pub fn signing_message(&self) -> Option<Vec<u8>> {
        let payload = NavPayload {
            version: self.version,
            contract: self.contract.clone(),
            representation_id: self.representation_id.clone(),
            nav: self.nav.0,
            currency: self.currency.clone(),
            as_of_ms: self.as_of_ms,
            cutoff_ms: self.cutoff_ms,
            simulated: self.simulated,
            source: self.source.clone(),
        };
        let mut message = NAV_DOMAIN.to_vec();
        message.extend(near_sdk::borsh::to_vec(&payload).ok()?);
        Some(message)
    }
}

impl NavStrike {
    /// Whether `now` is inside the window and the NAV is not older than twice the strike interval.
    pub fn window_open(&self, now: u64) -> bool {
        let interval = self.cutoff_ms.saturating_sub(self.as_of_ms);
        self.as_of_ms <= now
            && now < self.cutoff_ms
            && now - self.as_of_ms <= interval.saturating_mul(2)
    }
}

#[near]
impl Contract {
    /// Stores a signed NAV strike for a `nav_fund`. Anyone may call; the registered publisher's
    /// signature is the authority. Accepted only if `as_of_ms` is newer than the last strike and
    /// not more than a minute ahead, `cutoff_ms` is after it by at most seven days, the NAV is a
    /// positive price, and the signature verifies.
    #[payable]
    pub fn submit_nav_strike(
        &mut self,
        attestation: NavAttestation,
        signature: Base64VecU8,
        public_key: PublicKey,
    ) {
        assert_one_yocto();
        self.assert_not_paused();
        check(
            self.price_publishers.contains(&public_key),
            "signer is not a registered price publisher",
        );
        check(attestation.version == NAV_VERSION, "unsupported version");
        check(
            attestation.contract == env::current_account_id(),
            "attestation is for another contract",
        );
        let id = attestation.representation_id.clone();
        check(
            self.representations.contains_key(&id),
            "representation not found",
        );
        check(
            self.lifecycle_of(&id).kind == AssetKind::NavFund,
            "representation is not a nav_fund",
        );
        check(
            attestation.nav.0 > 0 && attestation.nav.0 <= crate::guard::MAX_PRICE,
            "nav must be positive and at most 2^64 - 1",
        );
        check(valid_currency(&attestation.currency), "invalid currency");
        check(attestation.source.len() <= 64, "source too long");
        let now = now_ms();
        check(
            attestation.as_of_ms <= now.saturating_add(MAX_FUTURE_SKEW_MS),
            "as_of_ms is in the future",
        );
        check(
            attestation.cutoff_ms > attestation.as_of_ms
                && attestation.cutoff_ms - attestation.as_of_ms <= MAX_STRIKE_INTERVAL_MS,
            "cutoff_ms must be after as_of_ms by at most 7 days",
        );
        if let Some(last) = self.nav_strikes.get(&id) {
            check(
                attestation.as_of_ms > last.as_of_ms,
                "strike is not newer than the stored one",
            );
        }
        let message = attestation
            .signing_message()
            .unwrap_or_else(|| env::panic_str("attestation cannot be encoded"));
        check(
            verify_ed25519(&public_key, &message, &signature.0),
            "bad signature",
        );
        self.nav_strikes.insert(
            id.clone(),
            NavStrike {
                as_of_ms: attestation.as_of_ms,
                nav_per_unit: attestation.nav,
                cutoff_ms: attestation.cutoff_ms,
                currency: attestation.currency.clone(),
                source: attestation.source.clone(),
                simulated: attestation.simulated,
                submitted_ms: now,
                publisher_key: public_key.clone(),
            },
        );
        ActionEvent::NavStrikePosted {
            representation_id: id.clone(),
            nav_per_unit: attestation.nav,
            currency: attestation.currency,
            as_of_ms: attestation.as_of_ms,
            cutoff_ms: attestation.cutoff_ms,
            simulated: attestation.simulated,
            source: attestation.source,
            publisher_key: String::from(&public_key),
            timestamp_ms: now,
        }
        .emit();
        self.evaluate_breakers_for(&id);
    }

    /// The latest strike of a representation, if any.
    pub fn get_nav_strike(&self, representation_id: String) -> Option<NavStrike> {
        self.nav_strikes.get(&representation_id).cloned()
    }
}

impl Contract {
    /// The reference price of a representation: the latest strike for a `nav_fund`, else the
    /// latest submitted price (ADR 0018 section 4).
    pub(crate) fn reference_price(&self, rep_id: &str) -> Option<PriceRecord> {
        if self.lifecycle_of(rep_id).kind == AssetKind::NavFund {
            return self.nav_strikes.get(rep_id).map(|s| PriceRecord {
                price: s.nav_per_unit,
                currency: s.currency.clone(),
                as_of_ms: s.as_of_ms,
                submitted_ms: s.submitted_ms,
                simulated: s.simulated,
                source: s.source.clone(),
                publisher_key: s.publisher_key.clone(),
            });
        }
        self.prices.get(rep_id).cloned()
    }
}
