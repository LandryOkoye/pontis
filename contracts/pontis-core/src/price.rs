//! Price reference (ADR 0016 section 1): signed price attestations from registered
//! `price_publisher` keys, stored as the latest price per representation.
//!
//! The signature is the authority, not the caller, so anyone (a relayer) may submit. The signed
//! bytes are `b"pontis-price-v2" ++ borsh(PricePayload)`; the contract rebuilds them from the JSON
//! fields (the quote pattern of ADR 0006) and `test-vectors/price-attestation.json` pins the layout
//! for Rust and TypeScript. `simulated` and `source` are stored and echoed so no consumer can lose
//! the label; the contract never acts on them.

use crate::events::CoreEvent;
use crate::types::check;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{assert_one_yocto, env, near, AccountId, CurveType, PublicKey};

pub const PRICE_DOMAIN: &[u8] = b"pontis-price-v2";
pub const PRICE_VERSION: u8 = 1;
/// A price may be at most this far ahead of the block time.
pub const MAX_FUTURE_SKEW_MS: u64 = 60_000;
pub const MAX_PUBLISHER_KEYS: usize = 8;

/// What a publisher signs, as it arrives in JSON.
#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct PriceAttestation {
    pub version: u8,
    pub contract: AccountId,
    pub representation_id: String,
    /// Price of one whole token at 8 decimals.
    pub price: U128,
    pub currency: String,
    pub as_of_ms: u64,
    pub simulated: bool,
    pub source: String,
}

/// The Borsh layout that is signed. Field order is part of the contract.
#[derive(Clone, Debug)]
#[near(serializers = [borsh])]
struct PricePayload {
    version: u8,
    contract: AccountId,
    representation_id: String,
    price: u128,
    currency: String,
    as_of_ms: u64,
    simulated: bool,
    source: String,
}

/// The latest accepted price of a representation.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct PriceRecord {
    pub price: U128,
    pub currency: String,
    pub as_of_ms: u64,
    pub submitted_ms: u64,
    pub simulated: bool,
    pub source: String,
    pub publisher_key: PublicKey,
}

impl PriceAttestation {
    /// The exact bytes a publisher signs.
    pub fn signing_message(&self) -> Option<Vec<u8>> {
        let payload = PricePayload {
            version: self.version,
            contract: self.contract.clone(),
            representation_id: self.representation_id.clone(),
            price: self.price.0,
            currency: self.currency.clone(),
            as_of_ms: self.as_of_ms,
            simulated: self.simulated,
            source: self.source.clone(),
        };
        let mut message = PRICE_DOMAIN.to_vec();
        message.extend(near_sdk::borsh::to_vec(&payload).ok()?);
        Some(message)
    }
}

/// Currencies are 1 to 8 uppercase ASCII letters.
pub(crate) fn valid_currency(currency: &str) -> bool {
    (1..=8).contains(&currency.len()) && currency.bytes().all(|b| b.is_ascii_uppercase())
}

/// Verifies an ed25519 signature made by `key` over `message`.
pub(crate) fn verify_ed25519(key: &PublicKey, message: &[u8], signature: &[u8]) -> bool {
    let (Ok(signature), Ok(public_key)) = (
        <[u8; 64]>::try_from(signature),
        <[u8; 32]>::try_from(&key.as_bytes()[1..]),
    ) else {
        return false;
    };
    env::ed25519_verify(&signature, message, &public_key)
}

#[near]
impl Contract {
    /// Owner only. Registers an ed25519 key whose signatures `submit_price` accepts. Several keys
    /// may be registered at once, which gives overlap during a rotation.
    #[payable]
    pub fn add_price_publisher_key(&mut self, public_key: PublicKey) {
        self.assert_owner();
        check(
            public_key.curve_type() == CurveType::ED25519,
            "price publisher key must be an ed25519 key",
        );
        check(
            self.price_publishers.len() < MAX_PUBLISHER_KEYS as u32,
            "too many price publisher keys",
        );
        check(
            self.price_publishers.insert(public_key.clone()),
            "key is already a price publisher",
        );
        CoreEvent::PricePublisherKeyAdded {
            public_key: String::from(&public_key),
            by: env::predecessor_account_id(),
        }
        .emit();
    }

    /// Owner only. Removing a key stops new submissions; stored prices stay until replaced.
    #[payable]
    pub fn remove_price_publisher_key(&mut self, public_key: PublicKey) {
        self.assert_owner();
        check(
            self.price_publishers.remove(&public_key),
            "key is not a price publisher",
        );
        CoreEvent::PricePublisherKeyRemoved {
            public_key: String::from(&public_key),
            by: env::predecessor_account_id(),
        }
        .emit();
    }

    /// Stores a signed price. Anyone may call; the registered publisher's signature is the
    /// authority. Blocked by the global pause. Accepted only if the key is registered, the payload
    /// names this contract and an existing representation, the price is positive, the currency is
    /// well formed, `as_of_ms` is not more than a minute ahead of the block time and is strictly
    /// newer than the stored price (so replay and rollback are impossible).
    #[payable]
    pub fn submit_price(
        &mut self,
        attestation: PriceAttestation,
        signature: Base64VecU8,
        public_key: PublicKey,
    ) {
        assert_one_yocto();
        self.assert_not_paused();
        check(
            self.price_publishers.contains(&public_key),
            "signer is not a registered price publisher",
        );
        check(attestation.version == PRICE_VERSION, "unsupported version");
        check(
            attestation.contract == env::current_account_id(),
            "attestation is for another contract",
        );
        check(
            self.representations
                .contains_key(&attestation.representation_id),
            "representation not found",
        );
        check(
            attestation.price.0 > 0 && attestation.price.0 <= crate::guard::MAX_PRICE,
            "price must be positive and at most 2^64 - 1",
        );
        check(valid_currency(&attestation.currency), "invalid currency");
        check(attestation.source.len() <= 64, "source too long");
        let now = now_ms();
        check(
            attestation.as_of_ms <= now.saturating_add(MAX_FUTURE_SKEW_MS),
            "as_of_ms is in the future",
        );
        if let Some(stored) = self.prices.get(&attestation.representation_id) {
            check(
                attestation.as_of_ms > stored.as_of_ms,
                "price is not newer than the stored one",
            );
        }
        let message = attestation
            .signing_message()
            .unwrap_or_else(|| env::panic_str("attestation cannot be encoded"));
        check(
            verify_ed25519(&public_key, &message, &signature.0),
            "bad signature",
        );
        let record = PriceRecord {
            price: attestation.price,
            currency: attestation.currency.clone(),
            as_of_ms: attestation.as_of_ms,
            submitted_ms: now,
            simulated: attestation.simulated,
            source: attestation.source.clone(),
            publisher_key: public_key.clone(),
        };
        self.prices
            .insert(attestation.representation_id.clone(), record);
        CoreEvent::PriceSubmitted {
            representation_id: attestation.representation_id.clone(),
            price: attestation.price,
            currency: attestation.currency,
            as_of_ms: attestation.as_of_ms,
            simulated: attestation.simulated,
            source: attestation.source,
            publisher_key: String::from(&public_key),
            timestamp_ms: now,
        }
        .emit();
        self.evaluate_breakers_for(&attestation.representation_id);
    }

    pub fn get_price(&self, representation_id: String) -> Option<PriceRecord> {
        self.prices.get(&representation_id).cloned()
    }

    pub fn get_price_publisher_keys(&self) -> Vec<PublicKey> {
        self.price_publishers.iter().cloned().collect()
    }
}
