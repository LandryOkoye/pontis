//! Redemption terms (ADR 0020 section 7): structured, enforced at request time, versioned and
//! identified by a hash the redeeming user quotes in the transfer message, so terms that changed
//! between the user's read and the transfer are refused (`TERMS_CHANGED`).

use crate::hexa;
use crate::redemption_events::RedemptionEvent;
use crate::redemption_types::*;
use crate::types::check;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{env, near, AccountId};

/// The Borsh layout hashed into `terms_hash`. Field order is part of the contract.
#[near(serializers = [borsh])]
struct TermsPayload {
    contract: AccountId,
    representation_id: String,
    version: u64,
    min_amount: u128,
    max_amount: u128,
    fee_bps: u16,
    window_anchor_ms: u64,
    window_length_ms: u64,
    window_period_ms: u64,
    accept_within_ms: u64,
    settlement_days: u16,
}

/// The exact bytes hashed: `b"pontis-redeem-terms-v1" ++ borsh(TermsPayload)`.
pub(crate) fn terms_message(
    contract: &AccountId,
    rep_id: &str,
    version: u64,
    t: &RedemptionTerms,
) -> Vec<u8> {
    let payload = TermsPayload {
        contract: contract.clone(),
        representation_id: rep_id.to_string(),
        version,
        min_amount: t.min_amount.0,
        max_amount: t.max_amount.0,
        fee_bps: t.fee_bps,
        window_anchor_ms: t.window_anchor_ms,
        window_length_ms: t.window_length_ms,
        window_period_ms: t.window_period_ms,
        accept_within_ms: t.accept_within_ms,
        settlement_days: t.settlement_days,
    };
    let mut bytes = TERMS_DOMAIN.to_vec();
    bytes.extend(near_sdk::borsh::to_vec(&payload).unwrap_or_default());
    bytes
}

pub(crate) fn terms_hash(
    contract: &AccountId,
    rep_id: &str,
    version: u64,
    t: &RedemptionTerms,
) -> String {
    hexa::encode(&env::sha256(terms_message(contract, rep_id, version, t)))
}

impl RedemptionTerms {
    /// Whether a request made at `now` falls in a redemption window.
    pub fn window_open(&self, now: u64) -> bool {
        if self.window_period_ms == 0 {
            return true;
        }
        now >= self.window_anchor_ms
            && (now - self.window_anchor_ms) % self.window_period_ms < self.window_length_ms
    }

    /// `ceil(amount * fee_bps / 10_000)`, rounded up so the rounding favours the issuer's fee.
    pub fn fee_units(&self, amount: u128) -> Option<u128> {
        let product = amount.checked_mul(u128::from(self.fee_bps))?;
        Some(product / 10_000 + u128::from(product % 10_000 != 0))
    }

    fn validate(&self) {
        check(self.min_amount.0 > 0, "min_amount must be positive");
        check(
            self.max_amount.0 == 0 || self.max_amount.0 >= self.min_amount.0,
            "max_amount must be 0 or at least min_amount",
        );
        check(
            self.fee_bps <= MAX_FEE_BPS_REDEEM,
            "fee_bps is at most 1000",
        );
        check(
            (MIN_ACCEPT_WITHIN_MS..=MAX_ACCEPT_WITHIN_MS).contains(&self.accept_within_ms),
            "accept_within_ms must be between 1 second and 30 days",
        );
        check(
            (1..=MAX_SETTLEMENT_DAYS).contains(&self.settlement_days),
            "settlement_days must be between 1 and 30",
        );
        if self.window_period_ms != 0 {
            check(
                self.window_length_ms > 0 && self.window_length_ms <= self.window_period_ms,
                "window_length_ms must be positive and at most the period",
            );
        }
    }
}

#[near]
impl Contract {
    /// Registrar only. Replaces the terms; the version rises by one and the hash changes, so a
    /// transfer quoting the old hash is refused. Requests already created keep their snapshot.
    #[payable]
    pub fn set_redemption_terms(&mut self, representation_id: String, terms: RedemptionTerms) {
        let by = self.assert_registrar();
        check(
            self.representations.contains_key(&representation_id),
            "representation not found",
        );
        terms.validate();
        let version = self
            .redemption_terms
            .get(&representation_id)
            .map_or(1, |r| r.version + 1);
        let hash = terms_hash(
            &env::current_account_id(),
            &representation_id,
            version,
            &terms,
        );
        let now = now_ms();
        self.redemption_terms.insert(
            representation_id.clone(),
            TermsRecord {
                terms: terms.clone(),
                version,
                terms_hash: hash.clone(),
                set_by: by.clone(),
                set_ms: now,
            },
        );
        RedemptionEvent::RedemptionTermsSet {
            representation_id,
            version,
            terms_hash: hash,
            terms,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    pub fn get_redemption_terms(&self, representation_id: String) -> Option<TermsRecord> {
        self.redemption_terms.get(&representation_id).cloned()
    }
}
