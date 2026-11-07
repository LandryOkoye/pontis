//! Issuer, canonical asset and representation registry (brief §6.2-6.4, §19.1).
//!
//! Records are registered `restricted` (visible, not executable). A registrar activates a record
//! only once it is complete (required fields, evidence, evidence-backed verification status,
//! and for a representation an active issuer and canonical asset). There are no update methods:
//! a mistake is fixed by rejecting or deprecating the record and registering a new one.

use crate::events::{CoreEvent, PauseScope};
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{env, near, AccountId};

const DEFAULT_PAGE: u32 = 50;
const MAX_PAGE: u32 = 100;

#[near]
impl Contract {
    // ---- registration (registrar) ----

    #[payable]
    pub fn register_issuer(&mut self, issuer: NewIssuer) {
        let by = self.assert_registrar();
        validate_id(&issuer.id, "issuer");
        check(
            !self.issuers.contains_key(&issuer.id),
            "issuer already registered",
        );
        require_text(&issuer.name, "name");
        bound_optional_text(&issuer.jurisdiction, "jurisdiction");
        bound_optional_text(&issuer.contact, "contact");
        require_list(
            &issuer.authorized_categories,
            "authorized_categories",
            false,
        );
        check(
            issuer.controlled_accounts.len() <= MAX_LIST_LEN,
            "too many controlled_accounts",
        );

        let now = now_ms();
        let id = issuer.id.clone();
        self.issuers.insert(
            id.clone(),
            Issuer {
                id: issuer.id,
                name: issuer.name,
                jurisdiction: issuer.jurisdiction,
                status: Status::Restricted,
                authorized_categories: issuer.authorized_categories,
                controlled_accounts: issuer.controlled_accounts,
                contact: issuer.contact,
                synthetic: issuer.synthetic,
                verification_status: issuer.verification_status,
                evidence: vec![],
                registered_by: by.clone(),
                registered_at_ms: now,
                last_reviewed_ms: None,
            },
        );
        CoreEvent::IssuerRegistered {
            id,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    #[payable]
    pub fn register_canonical_asset(&mut self, asset: NewCanonicalAsset) {
        let by = self.assert_registrar();
        validate_id(&asset.id, "canonical asset");
        check(
            !self.canonical_assets.contains_key(&asset.id),
            "canonical asset already registered",
        );
        require_text(&asset.name, "name");
        for (value, field) in [
            (&asset.category, "category"),
            (&asset.claim_description, "claim_description"),
            (&asset.unit_definition, "unit_definition"),
            (&asset.economic_rights, "economic_rights"),
            (&asset.legal_claim_structure, "legal_claim_structure"),
            (&asset.redemption_terms, "redemption_terms"),
            (&asset.eligibility_restrictions, "eligibility_restrictions"),
        ] {
            check(value.len() <= MAX_TEXT_LEN, &format!("{field} is too long"));
        }
        bound_optional_text(&asset.denomination, "denomination");
        bound_optional_text(&asset.jurisdiction, "jurisdiction");
        bound_optional_text(&asset.valuation_method, "valuation_method");
        require_list(&asset.risk_disclosures, "risk_disclosures", false);

        let now = now_ms();
        let id = asset.id.clone();
        self.canonical_assets.insert(
            id.clone(),
            CanonicalAsset {
                id: asset.id,
                name: asset.name,
                category: asset.category,
                claim_description: asset.claim_description,
                unit_definition: asset.unit_definition,
                denomination: asset.denomination,
                economic_rights: asset.economic_rights,
                legal_claim_structure: asset.legal_claim_structure,
                jurisdiction: asset.jurisdiction,
                redemption_terms: asset.redemption_terms,
                valuation_method: asset.valuation_method,
                eligibility_restrictions: asset.eligibility_restrictions,
                risk_disclosures: asset.risk_disclosures,
                synthetic: asset.synthetic,
                verification_status: asset.verification_status,
                status: Status::Restricted,
                evidence: vec![],
                registered_by: by.clone(),
                registered_at_ms: now,
                last_reviewed_ms: None,
            },
        );
        CoreEvent::CanonicalAssetRegistered {
            id,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    /// The issuer and canonical asset must already exist (any status). `unit_multiplier` is
    /// reduced to lowest terms; decimals and multiplier are immutable afterwards (ADR 0001).
    #[payable]
    pub fn register_representation(&mut self, representation: NewRepresentation) {
        let by = self.assert_registrar();
        let r = representation;
        validate_id(&r.id, "representation");
        check(
            !self.representations.contains_key(&r.id),
            "representation already registered",
        );
        check(
            self.canonical_assets.contains_key(&r.canonical_asset_id),
            "canonical asset not found",
        );
        check(self.issuers.contains_key(&r.issuer_id), "issuer not found");
        check(
            !self.representation_by_account.contains_key(&r.account_id),
            "token account already registered",
        );
        require_text(&r.name, "name");
        require_text(&r.symbol, "symbol");
        check(r.decimals <= MAX_DECIMALS, "decimals must be at most 38");
        let unit_multiplier = Ratio::normalised(r.unit_multiplier.num, r.unit_multiplier.den);
        for (value, field) in [
            (&r.custody_description, "custody_description"),
            (&r.redemption_mechanism, "redemption_mechanism"),
            (&r.transfer_policy_summary, "transfer_policy_summary"),
        ] {
            check(value.len() <= MAX_TEXT_LEN, &format!("{field} is too long"));
        }
        require_list(&r.admin_capabilities, "admin_capabilities", false);

        let now = now_ms();
        let id = r.id.clone();
        self.representation_by_account
            .insert(r.account_id.clone(), id.clone());
        let event = CoreEvent::RepresentationRegistered {
            id: id.clone(),
            canonical_asset_id: r.canonical_asset_id.clone(),
            issuer_id: r.issuer_id.clone(),
            account_id: r.account_id.clone(),
            by: by.clone(),
            timestamp_ms: now,
        };
        self.representations.insert(
            id,
            Representation {
                id: r.id,
                canonical_asset_id: r.canonical_asset_id,
                issuer_id: r.issuer_id,
                account_id: r.account_id,
                name: r.name,
                symbol: r.symbol,
                decimals: r.decimals,
                unit_multiplier,
                admin_capabilities: r.admin_capabilities,
                custody_description: r.custody_description,
                redemption_mechanism: r.redemption_mechanism,
                transfer_policy_summary: r.transfer_policy_summary,
                bridge_status: r.bridge_status,
                synthetic: r.synthetic,
                verification_status: r.verification_status,
                status: Status::Restricted,
                evidence: vec![],
                registered_by: by,
                registered_at_ms: now,
                last_reviewed_ms: None,
            },
        );
        event.emit();
    }

    /// Attaches an evidence reference to a record that is not rejected.
    #[payable]
    pub fn add_evidence(
        &mut self,
        subject_type: SubjectType,
        subject_id: String,
        evidence: NewEvidence,
    ) {
        let by = self.assert_registrar();
        check(
            !evidence.uri.trim().is_empty() && evidence.uri.len() <= MAX_TEXT_LEN,
            "uri must be 1-2000 chars",
        );
        validate_sha256(&evidence.sha256);
        require_text(&evidence.description, "description");

        let (list, status) = match subject_type {
            SubjectType::Issuer => self
                .issuers
                .get_mut(&subject_id)
                .map(|r| (&mut r.evidence, r.status))
                .unwrap_or_else(|| env::panic_str("issuer not found")),
            SubjectType::CanonicalAsset => self
                .canonical_assets
                .get_mut(&subject_id)
                .map(|r| (&mut r.evidence, r.status))
                .unwrap_or_else(|| env::panic_str("canonical asset not found")),
            SubjectType::Representation => self
                .representations
                .get_mut(&subject_id)
                .map(|r| (&mut r.evidence, r.status))
                .unwrap_or_else(|| env::panic_str("representation not found")),
            SubjectType::Compatibility => {
                env::panic_str("use add_compatibility_evidence for compatibility evidence")
            }
        };
        check(
            status != Status::Rejected,
            "cannot add evidence to a rejected record",
        );
        check(
            list.len() < MAX_EVIDENCE_PER_RECORD,
            "too much evidence on this record",
        );

        let now = now_ms();
        let event = CoreEvent::EvidenceAdded {
            subject_type,
            subject_id,
            uri: evidence.uri.clone(),
            sha256: evidence.sha256.clone(),
            provenance: evidence.provenance,
            by: by.clone(),
            timestamp_ms: now,
        };
        list.push(EvidenceRef {
            uri: evidence.uri,
            sha256: evidence.sha256,
            provenance: evidence.provenance,
            description: evidence.description,
            added_by: by,
            timestamp_ms: now,
        });
        event.emit();
    }

    // ---- status changes (registrar) ----

    /// Allowed: restricted to active, rejected or deprecated; active to restricted or deprecated.
    /// Activation requires a complete record (brief §19.1). Pausing is a separate method.
    #[payable]
    pub fn set_issuer_status(&mut self, id: String, status: Status) {
        let by = self.assert_registrar();
        let issuer = self
            .issuers
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("issuer not found"));
        let from = issuer.status;
        check(
            from.registrar_may_move(status),
            "status transition not allowed",
        );
        let now = now_ms();
        if status == Status::Active {
            assert_issuer_complete(issuer);
            issuer.last_reviewed_ms = Some(now);
        }
        issuer.status = status;
        CoreEvent::IssuerStatusChanged {
            id,
            from,
            to: status,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    #[payable]
    pub fn set_canonical_asset_status(&mut self, id: String, status: Status) {
        let by = self.assert_registrar();
        let asset = self
            .canonical_assets
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("canonical asset not found"));
        let from = asset.status;
        check(
            from.registrar_may_move(status),
            "status transition not allowed",
        );
        let now = now_ms();
        if status == Status::Active {
            assert_canonical_asset_complete(asset);
            asset.last_reviewed_ms = Some(now);
        }
        asset.status = status;
        CoreEvent::CanonicalAssetStatusChanged {
            id,
            from,
            to: status,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    #[payable]
    pub fn set_representation_status(&mut self, id: String, status: Status) {
        let by = self.assert_registrar();
        let now = now_ms();
        let from = self.activate_checked(&id, status, now);
        CoreEvent::RepresentationStatusChanged {
            id,
            from,
            to: status,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    // ---- per-asset pause ----

    /// Pauser only; not blocked by the global pause. Takes effect immediately.
    #[payable]
    pub fn pause_asset(&mut self, id: String) {
        let by = self.assert_pauser();
        let rep = self
            .representations
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        check(
            rep.status == Status::Active,
            "only an active representation can be paused",
        );
        rep.status = Status::Paused;
        let now = now_ms();
        CoreEvent::Paused {
            scope: PauseScope::Asset,
            target: Some(id.clone()),
            by: by.clone(),
        }
        .emit();
        CoreEvent::RepresentationStatusChanged {
            id,
            from: Status::Active,
            to: Status::Paused,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    /// Owner only. The representation must still satisfy the activation rules.
    #[payable]
    pub fn unpause_asset(&mut self, id: String) {
        self.assert_owner();
        let by = env::predecessor_account_id();
        let now = now_ms();
        let rep = self
            .representations
            .get(&id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        check(rep.status == Status::Paused, "representation is not paused");
        assert_representation_complete(rep, &self.issuers, &self.canonical_assets);
        let rep = self
            .representations
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        rep.status = Status::Active;
        CoreEvent::Unpaused {
            scope: PauseScope::Asset,
            target: Some(id.clone()),
            by: by.clone(),
        }
        .emit();
        CoreEvent::RepresentationStatusChanged {
            id,
            from: Status::Paused,
            to: Status::Active,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    // ---- views ----

    pub fn get_issuer(&self, id: String) -> Option<Issuer> {
        self.issuers.get(&id).cloned()
    }

    pub fn list_issuers(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Issuer> {
        page(self.issuers.values(), from_index, limit)
    }

    pub fn get_canonical_asset(&self, id: String) -> Option<CanonicalAsset> {
        self.canonical_assets.get(&id).cloned()
    }

    pub fn list_canonical_assets(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<CanonicalAsset> {
        page(self.canonical_assets.values(), from_index, limit)
    }

    pub fn get_representation(&self, id: String) -> Option<Representation> {
        self.representations.get(&id).cloned()
    }

    pub fn list_representations(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<Representation> {
        page(self.representations.values(), from_index, limit)
    }

    /// Looks a representation up by its token contract account (used on `ft_on_transfer`).
    pub fn get_representation_by_account(&self, account_id: AccountId) -> Option<Representation> {
        let id = self.representation_by_account.get(&account_id)?;
        self.representations.get(id).cloned()
    }

    /// True when the global pause is off and the representation, its issuer and its canonical
    /// asset are all `active`. Compatibility checks are added by B6.
    pub fn is_representation_executable(&self, id: String) -> bool {
        let Some(rep) = self.representations.get(&id) else {
            return false;
        };
        !self.paused
            && rep.status == Status::Active
            && self
                .issuers
                .get(&rep.issuer_id)
                .is_some_and(|i| i.status == Status::Active)
            && self
                .canonical_assets
                .get(&rep.canonical_asset_id)
                .is_some_and(|a| a.status == Status::Active)
    }
}

impl Contract {
    /// Validates the transition (and completeness for activation) and applies it.
    fn activate_checked(&mut self, id: &str, to: Status, now: u64) -> Status {
        let rep = self
            .representations
            .get(id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        let from = rep.status;
        check(from.registrar_may_move(to), "status transition not allowed");
        if to == Status::Active {
            assert_representation_complete(rep, &self.issuers, &self.canonical_assets);
        }
        let rep = self
            .representations
            .get_mut(id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        if to == Status::Active {
            rep.last_reviewed_ms = Some(now);
        }
        rep.status = to;
        from
    }
}

pub(crate) fn page<'a, T: Clone + 'a>(
    items: impl Iterator<Item = &'a T>,
    from_index: Option<u32>,
    limit: Option<u32>,
) -> Vec<T> {
    let limit = limit.unwrap_or(DEFAULT_PAGE).min(MAX_PAGE) as usize;
    items
        .skip(from_index.unwrap_or(0) as usize)
        .take(limit)
        .cloned()
        .collect()
}

// ---- completeness rules for activation (brief §19.1) ----

fn assert_verification_backed(status: VerificationStatus, evidence: &[EvidenceRef]) {
    check(
        !evidence.is_empty(),
        "at least one evidence reference is required",
    );
    check(
        status.supported_by(evidence),
        "verification_status claims more than the attached evidence supports",
    );
}

fn assert_issuer_complete(i: &Issuer) {
    require_text(&i.name, "name");
    require_list(&i.authorized_categories, "authorized_categories", true);
    assert_verification_backed(i.verification_status, &i.evidence);
}

fn assert_canonical_asset_complete(a: &CanonicalAsset) {
    for (value, field) in [
        (&a.name, "name"),
        (&a.category, "category"),
        (&a.claim_description, "claim_description"),
        (&a.unit_definition, "unit_definition"),
        (&a.economic_rights, "economic_rights"),
        (&a.legal_claim_structure, "legal_claim_structure"),
        (&a.redemption_terms, "redemption_terms"),
        (&a.eligibility_restrictions, "eligibility_restrictions"),
    ] {
        require_text(value, field);
    }
    require_list(&a.risk_disclosures, "risk_disclosures", true);
    assert_verification_backed(a.verification_status, &a.evidence);
}

fn assert_representation_complete(
    r: &Representation,
    issuers: &near_sdk::store::IterableMap<String, Issuer>,
    assets: &near_sdk::store::IterableMap<String, CanonicalAsset>,
) {
    for (value, field) in [
        (&r.name, "name"),
        (&r.symbol, "symbol"),
        (&r.custody_description, "custody_description"),
        (&r.redemption_mechanism, "redemption_mechanism"),
        (&r.transfer_policy_summary, "transfer_policy_summary"),
    ] {
        require_text(value, field);
    }
    assert_verification_backed(r.verification_status, &r.evidence);
    check(
        issuers
            .get(&r.issuer_id)
            .is_some_and(|i| i.status == Status::Active),
        "issuer must be active",
    );
    check(
        assets
            .get(&r.canonical_asset_id)
            .is_some_and(|a| a.status == Status::Active),
        "canonical asset must be active",
    );
}
