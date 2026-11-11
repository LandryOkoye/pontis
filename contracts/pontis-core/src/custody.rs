//! Custody registry (ADR 0020 section 2): custodians, their attester keys and the link from a
//! representation to its custodians. Registrar methods; a registrar can never also be a reserve
//! attester (ADR 0019), so whoever registers a custodian cannot sign its reserves.

use crate::custody_events::CustodyEvent;
use crate::custody_types::*;
use crate::events::RoleName;
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{env, near, PublicKey};

#[near]
impl Contract {
    /// Registrar only. The attester key must already be registered for `reserve_attester` with
    /// scope `reserves`. Evidence follows the rules of ADR 0009: `independently_verified` is never
    /// accepted and a claimed status must be backed by the evidence's provenance.
    #[payable]
    pub fn register_custodian(&mut self, custodian: NewCustodian) {
        let by = self.assert_registrar();
        validate_id(&custodian.id, "custodian");
        require_text(&custodian.name, "name");
        bound_optional_text(&custodian.jurisdiction, "jurisdiction");
        check(
            !self.custodians.contains_key(&custodian.id),
            "custodian already exists",
        );
        check(
            custodian.evidence.len() <= MAX_EVIDENCE_PER_RECORD,
            "too much evidence on this record",
        );
        self.assert_reserve_key(&custodian.attester_key);
        check(
            custodian.verification_status != VerificationStatus::IndependentlyVerified,
            "independently_verified is not available: no authenticated verifier exists in this MVP",
        );
        let now = now_ms();
        let mut evidence = Vec::new();
        for e in custodian.evidence {
            validate_new_evidence(&e);
            evidence.push(EvidenceRef {
                uri: e.uri,
                sha256: e.sha256,
                provenance: e.provenance,
                description: e.description,
                added_by: by.clone(),
                timestamp_ms: now,
            });
        }
        check(
            custodian.verification_status.supported_by(&evidence),
            "verification_status is not supported by the evidence",
        );
        CustodyEvent::CustodianRegistered {
            id: custodian.id.clone(),
            attester_key: String::from(&custodian.attester_key),
            by: by.clone(),
            timestamp_ms: now,
        }
        .emit();
        self.custodians.insert(
            custodian.id.clone(),
            Custodian {
                id: custodian.id,
                name: custodian.name,
                jurisdiction: custodian.jurisdiction,
                attester_key: custodian.attester_key,
                status: CustodianStatus::Active,
                synthetic: custodian.synthetic,
                verification_status: custodian.verification_status,
                evidence,
                registered_by: by,
                registered_at_ms: now,
            },
        );
    }

    /// Registrar only. `active <-> suspended`, and either to `retired`, which is final. A
    /// suspended or retired custodian contributes no reserves (ADR 0020 section 5).
    #[payable]
    pub fn set_custodian_status(&mut self, id: String, status: CustodianStatus) {
        let by = self.assert_registrar();
        let custodian = self
            .custodians
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("custodian not found"));
        let from = custodian.status;
        check(from.may_move(status), "status change is not allowed");
        custodian.status = status;
        CustodyEvent::CustodianStatusChanged {
            id,
            from,
            to: status,
            by,
            timestamp_ms: now_ms(),
        }
        .emit();
    }

    /// Registrar only. Rotates the key; the old key stops signing for this custodian at once.
    #[payable]
    pub fn set_custodian_key(&mut self, id: String, attester_key: PublicKey) {
        let by = self.assert_registrar();
        self.assert_reserve_key(&attester_key);
        let custodian = self
            .custodians
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("custodian not found"));
        check(
            custodian.status != CustodianStatus::Retired,
            "custodian is retired",
        );
        custodian.attester_key = attester_key.clone();
        CustodyEvent::CustodianKeySet {
            id,
            attester_key: String::from(&attester_key),
            by,
            timestamp_ms: now_ms(),
        }
        .emit();
    }

    /// Registrar only. Replaces the link: 1 to 4 distinct existing active custodians.
    #[payable]
    pub fn link_custody(
        &mut self,
        representation_id: String,
        structure: CustodyStructure,
        custodian_ids: Vec<String>,
    ) {
        let by = self.assert_registrar();
        check(
            self.representations.contains_key(&representation_id),
            "representation not found",
        );
        check(
            (1..=MAX_CUSTODIANS_PER_LINK).contains(&custodian_ids.len()),
            "a link needs 1 to 4 custodians",
        );
        for (i, id) in custodian_ids.iter().enumerate() {
            check(!custodian_ids[..i].contains(id), "duplicate custodian");
            check(
                self.custodians
                    .get(id)
                    .is_some_and(|c| c.status == CustodianStatus::Active),
                "custodian not found or not active",
            );
        }
        let now = now_ms();
        self.custody_links.insert(
            representation_id.clone(),
            CustodyLink {
                representation_id: representation_id.clone(),
                structure,
                custodian_ids: custodian_ids.clone(),
                linked_by: by.clone(),
                linked_at_ms: now,
            },
        );
        CustodyEvent::CustodyLinked {
            representation_id: representation_id.clone(),
            structure,
            custodian_ids,
            by,
            timestamp_ms: now,
        }
        .emit();
        self.refresh_reserve_state(&representation_id);
    }

    pub fn get_custodian(&self, id: String) -> Option<Custodian> {
        self.custodians.get(&id).cloned()
    }

    pub fn get_custodians(&self, from_index: u64, limit: u64) -> Page<Custodian> {
        Page {
            items: self
                .custodians
                .values()
                .skip(from_index as usize)
                .take(page_limit(limit))
                .cloned()
                .collect(),
            total: u64::from(self.custodians.len()),
        }
    }

    pub fn get_custody_link(&self, representation_id: String) -> Option<CustodyLink> {
        self.custody_links.get(&representation_id).cloned()
    }
}

impl Contract {
    /// The key must be registered for `reserve_attester` with scope `reserves`.
    fn assert_reserve_key(&self, key: &PublicKey) {
        let registered = self
            .get_signer_keys(RoleName::ReserveAttester)
            .iter()
            .any(|k| &k.public_key == key && k.scopes.iter().any(|s| s == "reserves"));
        check(
            registered,
            "key is not a registered reserve attester key with scope reserves",
        );
    }
}
