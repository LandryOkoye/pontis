//! Reserve attestations and the per-representation reserve policy (ADR 0020 sections 3 and 4).
//!
//! The signature is the authority, not the caller, so anyone (a relayer) may submit. The key must
//! be the one registered for the named custodian and must also be a registered `reserve_attester`
//! signer key with scope `reserves` (`verify_signer`), so removing the key or revoking the role
//! stops new attestations at once.

use crate::custody_events::CustodyEvent;
use crate::custody_types::*;
use crate::events::RoleName;
use crate::reserve_types::*;
use crate::signers::SignerError;
use crate::types::{check, Status};
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::Base64VecU8;
use near_sdk::{assert_one_yocto, env, near, PublicKey};

/// An attestation may be at most this far ahead of the block time.
pub const MAX_FUTURE_SKEW_MS: u64 = 60_000;

#[near]
impl Contract {
    /// Owner only. Sets how a representation's reserves are judged. `baseline_supply` seeds the
    /// mint ledger the first time and cannot change afterwards.
    #[payable]
    pub fn set_reserve_policy(&mut self, representation_id: String, policy: ReservePolicy) {
        self.assert_owner();
        self.assert_not_paused();
        check(
            self.representations.contains_key(&representation_id),
            "representation not found",
        );
        check(
            policy.tolerance_bps <= MAX_TOLERANCE_BPS,
            "tolerance_bps is at most 1000",
        );
        check(
            (MIN_RESERVE_AGE_MS..=MAX_RESERVE_AGE_MS).contains(&policy.max_reserve_age_ms),
            "max_reserve_age_ms must be between 1 minute and 30 days",
        );
        match self.reserve_policies.get(&representation_id) {
            Some(old) => check(
                old.baseline_supply == policy.baseline_supply,
                "baseline_supply cannot change once set",
            ),
            None => {
                self.supply_ledger
                    .insert(representation_id.clone(), policy.baseline_supply.0);
            }
        }
        self.reserve_policies
            .insert(representation_id.clone(), policy.clone());
        CustodyEvent::ReservePolicySet {
            representation_id: representation_id.clone(),
            policy,
            by: env::predecessor_account_id(),
            timestamp_ms: now_ms(),
        }
        .emit();
        self.refresh_reserve_state(&representation_id);
    }

    /// Stores a signed reserve attestation. Anyone may call. Blocked by the global pause and by a
    /// paused representation. Accepted only if the payload names this contract, the custodian is
    /// active, linked to the representation and holds `public_key`, the key is a registered
    /// reserve attester key with scope `reserves`, the figures are in range, `as_of_ms` is not
    /// more than a minute ahead and is strictly newer than the stored one for that custodian.
    #[payable]
    pub fn submit_reserve_attestation(
        &mut self,
        attestation: ReserveAttestation,
        signature: Base64VecU8,
        public_key: PublicKey,
    ) {
        assert_one_yocto();
        self.assert_not_paused();
        check(
            attestation.version == RESERVE_VERSION,
            "unsupported version",
        );
        check(
            attestation.contract == env::current_account_id(),
            "attestation is for another contract",
        );
        let rep_id = attestation.representation_id.clone();
        let rep = self
            .representations
            .get(&rep_id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        check(rep.status != Status::Paused, "representation is paused");
        check(
            self.custody_links
                .get(&rep_id)
                .is_some_and(|l| l.custodian_ids.contains(&attestation.custodian_id)),
            "custodian is not linked to this representation",
        );
        let custodian = self
            .custodians
            .get(&attestation.custodian_id)
            .unwrap_or_else(|| env::panic_str("custodian not found"));
        check(
            custodian.status == CustodianStatus::Active,
            "custodian is not active",
        );
        check(
            custodian.attester_key == public_key,
            "key is not this custodian's attester key",
        );
        check(
            attestation.reserved_units.0 <= MAX_RESERVED_UNITS,
            "reserved_units is above 2^100",
        );
        check(attestation.report_uri.len() <= 256, "report_uri too long");
        check(attestation.source.len() <= 64, "source too long");
        let now = now_ms();
        check(
            attestation.as_of_ms <= now.saturating_add(MAX_FUTURE_SKEW_MS),
            "as_of_ms is in the future",
        );
        let latest_key = latest_key(&rep_id, &attestation.custodian_id);
        if let Some(stored) = self.reserve_latest.get(&latest_key) {
            check(
                attestation.as_of_ms > stored.as_of_ms,
                "attestation is not newer than the stored one",
            );
        }
        let message = attestation
            .signing_message()
            .unwrap_or_else(|| env::panic_str("report_hash must be 64 lowercase hex characters"));
        match self.verify_signer(
            RoleName::ReserveAttester,
            &public_key,
            "reserves",
            &message,
            &signature.0,
        ) {
            Ok(_) => {}
            Err(SignerError::UnknownKey) => {
                env::panic_str("signer is not a registered reserve attester")
            }
            Err(SignerError::ScopeMissing) => env::panic_str("key lacks the reserves scope"),
            Err(SignerError::BadSignature) => env::panic_str("bad signature"),
        }
        let seq = self.reserve_seq.get(&rep_id).copied().unwrap_or(0);
        let record = ReserveRecord {
            seq,
            custodian_id: attestation.custodian_id.clone(),
            reserved_units: attestation.reserved_units,
            as_of_ms: attestation.as_of_ms,
            submitted_ms: now,
            report_hash: attestation.report_hash.clone(),
            report_uri: attestation.report_uri.clone(),
            simulated: attestation.simulated,
            source: attestation.source.clone(),
            attester_key: public_key.clone(),
        };
        self.reserve_history
            .insert((rep_id.clone(), seq % HISTORY_RING), record.clone());
        self.reserve_seq.insert(rep_id.clone(), seq + 1);
        self.reserve_latest.insert(latest_key, record);
        CustodyEvent::ReserveAttested {
            representation_id: rep_id.clone(),
            custodian_id: attestation.custodian_id,
            reserved_units: attestation.reserved_units,
            as_of_ms: attestation.as_of_ms,
            report_hash: attestation.report_hash,
            report_uri: attestation.report_uri,
            simulated: attestation.simulated,
            source: attestation.source,
            attester_key: String::from(&public_key),
            seq,
            timestamp_ms: now,
        }
        .emit();
        self.refresh_reserve_state(&rep_id);
    }

    pub fn get_reserve_policy(&self, representation_id: String) -> Option<ReservePolicy> {
        self.reserve_policies.get(&representation_id).cloned()
    }

    /// The latest attestation of `custodian_id`, or the newest across custodians when omitted.
    pub fn get_reserve_attestation(
        &self,
        representation_id: String,
        custodian_id: Option<String>,
    ) -> Option<ReserveRecord> {
        match custodian_id {
            Some(id) => self
                .reserve_latest
                .get(&latest_key(&representation_id, &id))
                .cloned(),
            None => self
                .get_reserve_attestations(representation_id)
                .into_iter()
                .max_by_key(|r| r.as_of_ms),
        }
    }

    /// The latest attestation of each linked custodian that has one.
    pub fn get_reserve_attestations(&self, representation_id: String) -> Vec<ReserveRecord> {
        let Some(link) = self.custody_links.get(&representation_id) else {
            return Vec::new();
        };
        link.custodian_ids
            .iter()
            .filter_map(|id| self.reserve_latest.get(&latest_key(&representation_id, id)))
            .cloned()
            .collect()
    }

    /// History by sequence number; entries older than the last `HISTORY_RING` are gone.
    pub fn get_reserve_history(
        &self,
        representation_id: String,
        from_index: u64,
        limit: u64,
    ) -> Page<ReserveRecord> {
        let total = self
            .reserve_seq
            .get(&representation_id)
            .copied()
            .unwrap_or(0);
        let first = from_index.max(total.saturating_sub(HISTORY_RING));
        let end = total.min(first.saturating_add(page_limit(limit) as u64));
        let items = (first..end)
            .filter_map(|seq| {
                self.reserve_history
                    .get(&(representation_id.clone(), seq % HISTORY_RING))
            })
            .cloned()
            .collect();
        Page { items, total }
    }
}

fn latest_key(representation_id: &str, custodian_id: &str) -> String {
    format!("{representation_id}|{custodian_id}")
}
