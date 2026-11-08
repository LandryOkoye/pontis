use crate::tests::{account, alice, as_account, last_event, new_core, owner};
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::AccountId;

pub(crate) fn registrar() -> AccountId {
    account("registrar.testnet")
}
pub(crate) fn pauser() -> AccountId {
    account("pauser.testnet")
}
pub(crate) fn token_a() -> AccountId {
    account("tgold-a.testnet")
}
pub(crate) fn token_b() -> AccountId {
    account("tgold-b.testnet")
}
pub(crate) const SHA: &str = "a3f1c2d4e5b60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

/// Core with a registrar and a pauser; the context is left as the registrar.
pub(crate) fn core() -> Contract {
    let mut c = new_core();
    c.grant_role(RoleName::Registrar, registrar());
    c.grant_role(RoleName::Pauser, pauser());
    as_account(registrar());
    c
}

pub(crate) fn new_issuer(id: &str) -> NewIssuer {
    NewIssuer {
        id: id.to_string(),
        name: "Synthetic Issuer".to_string(),
        jurisdiction: None,
        authorized_categories: vec!["synthetic test claims".to_string()],
        controlled_accounts: vec![token_a()],
        contact: None,
        synthetic: true,
        verification_status: VerificationStatus::Unverified,
    }
}

pub(crate) fn new_asset(id: &str) -> NewCanonicalAsset {
    let t = |s: &str| s.to_string();
    NewCanonicalAsset {
        id: t(id),
        name: t("Synthetic Gold, one troy ounce"),
        category: t("Synthetic commodity claim"),
        claim_description: t("A fictional claim to one troy ounce of fictional gold"),
        unit_definition: t("1 canonical unit = 1 fictional troy ounce"),
        denomination: None,
        economic_rights: t("None"),
        legal_claim_structure: t("None"),
        jurisdiction: None,
        redemption_terms: t("None"),
        valuation_method: None,
        eligibility_restrictions: t("Testnet allowlist only"),
        risk_disclosures: vec![t("Not backed by any asset")],
        synthetic: true,
        verification_status: VerificationStatus::Unverified,
    }
}

pub(crate) fn new_rep(
    id: &str,
    issuer: &str,
    asset: &str,
    account_id: AccountId,
) -> NewRepresentation {
    let t = |s: &str| s.to_string();
    NewRepresentation {
        id: t(id),
        canonical_asset_id: t(asset),
        issuer_id: t(issuer),
        account_id,
        name: t("SYNTHETIC TEST Gold A"),
        symbol: t("TGOLD-A"),
        decimals: 6,
        unit_multiplier: Ratio {
            num: U128(1),
            den: U128(1_000_000),
        },
        admin_capabilities: vec![t("owner mint")],
        custody_description: t("None"),
        redemption_mechanism: t("None"),
        transfer_policy_summary: t("Testnet allowlist"),
        bridge_status: BridgeStatus::None,
        synthetic: true,
        verification_status: VerificationStatus::Unverified,
    }
}

pub(crate) fn evidence(provenance: Provenance) -> NewEvidence {
    NewEvidence {
        uri: "docs/asset-dossiers/TGOLD-A.md".to_string(),
        sha256: SHA.to_string(),
        provenance,
        description: "Self-attested synthetic dossier".to_string(),
    }
}

pub(crate) fn attest(c: &mut Contract, subject: SubjectType, id: &str) {
    c.add_evidence(
        subject,
        id.to_string(),
        evidence(Provenance::IssuerProvided),
    );
}

/// Registers, evidences and activates issuer `iss`, canonical asset `gold` and rep `tgold-a`.
fn active_registry(c: &mut Contract) {
    c.register_issuer(new_issuer("iss"));
    attest(c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Active);
    c.register_canonical_asset(new_asset("gold"));
    attest(c, SubjectType::CanonicalAsset, "gold");
    c.set_canonical_asset_status("gold".into(), Status::Active);
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
    attest(c, SubjectType::Representation, "tgold-a");
    c.set_representation_status("tgold-a".into(), Status::Active);
}

// ---- access control ----

#[test]
#[should_panic(expected = "caller is not a registrar")]
fn non_registrar_cannot_register() {
    let mut c = core();
    as_account(alice());
    c.register_issuer(new_issuer("iss"));
}

#[test]
#[should_panic(expected = "caller is not a registrar")]
fn owner_is_not_implicitly_a_registrar() {
    let mut c = core();
    as_account(owner());
    c.register_issuer(new_issuer("iss"));
}

#[test]
#[should_panic(expected = "contract is paused")]
fn registration_is_blocked_while_globally_paused() {
    let mut c = core();
    as_account(pauser());
    c.pause();
    as_account(registrar());
    c.register_issuer(new_issuer("iss"));
}

// ---- issuers ----

#[test]
fn issuer_registers_restricted_with_an_event() {
    let mut c = core();
    c.register_issuer(new_issuer("synthetic-issuer-a"));
    let i = c.get_issuer("synthetic-issuer-a".into()).unwrap();
    assert_eq!(i.status, Status::Restricted);
    assert!(i.synthetic);
    assert_eq!(i.verification_status, VerificationStatus::Unverified);
    assert!(i.evidence.is_empty());
    assert_eq!(i.registered_by, registrar());
    let e = last_event();
    assert_eq!(e["event"], "issuer_registered");
    assert_eq!(e["data"]["id"], "synthetic-issuer-a");
    assert_eq!(e["data"]["timestamp_ms"], 5_000);
}

#[test]
#[should_panic(expected = "issuer already registered")]
fn duplicate_issuer_id_is_rejected() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.register_issuer(new_issuer("iss"));
}

#[test]
#[should_panic(expected = "issuer id must be")]
fn uppercase_ids_are_rejected() {
    let mut c = core();
    c.register_issuer(new_issuer("Issuer"));
}

#[test]
#[should_panic(expected = "issuer id must be")]
fn ids_cannot_start_with_a_dash() {
    let mut c = core();
    c.register_issuer(new_issuer("-iss"));
}

#[test]
#[should_panic(expected = "at least one evidence reference is required")]
fn issuer_without_evidence_cannot_become_active() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.set_issuer_status("iss".into(), Status::Active);
}

#[test]
#[should_panic(expected = "authorized_categories must not be empty")]
fn issuer_without_categories_cannot_become_active() {
    let mut c = core();
    let mut i = new_issuer("iss");
    i.authorized_categories.clear();
    c.register_issuer(i);
    attest(&mut c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Active);
}

#[test]
fn issuer_with_evidence_becomes_active_and_is_reviewed() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    attest(&mut c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Active);
    let i = c.get_issuer("iss".into()).unwrap();
    assert_eq!(i.status, Status::Active);
    assert_eq!(i.last_reviewed_ms, Some(5_000));
    let e = last_event();
    assert_eq!(e["event"], "issuer_status_changed");
    assert_eq!(e["data"]["from"], "restricted");
    assert_eq!(e["data"]["to"], "active");
}

#[test]
#[should_panic(expected = "claims more than the attached evidence supports")]
fn verification_status_cannot_exceed_the_evidence() {
    let mut c = core();
    let mut i = new_issuer("iss");
    i.verification_status = VerificationStatus::IndependentlyVerified;
    c.register_issuer(i);
    attest(&mut c, SubjectType::Issuer, "iss"); // issuer_provided only
    c.set_issuer_status("iss".into(), Status::Active);
}

#[test]
fn verification_status_is_allowed_when_the_evidence_supports_it() {
    let mut c = core();
    let mut i = new_issuer("iss");
    i.verification_status = VerificationStatus::IndependentlyVerified;
    c.register_issuer(i);
    c.add_evidence(
        SubjectType::Issuer,
        "iss".into(),
        evidence(Provenance::IndependentlyVerified),
    );
    c.set_issuer_status("iss".into(), Status::Active);
    assert_eq!(c.get_issuer("iss".into()).unwrap().status, Status::Active);
}

#[test]
fn listing_is_paginated_in_registration_order() {
    let mut c = core();
    for id in ["iss-a", "iss-b", "iss-c"] {
        c.register_issuer(new_issuer(id));
    }
    let ids = |v: Vec<Issuer>| v.into_iter().map(|i| i.id).collect::<Vec<_>>();
    assert_eq!(ids(c.list_issuers(None, None)), ["iss-a", "iss-b", "iss-c"]);
    assert_eq!(ids(c.list_issuers(Some(1), Some(1))), ["iss-b"]);
    assert!(c.list_issuers(Some(5), None).is_empty());
    assert!(c.get_issuer("missing".into()).is_none());
}

// ---- status transitions ----

#[test]
#[should_panic(expected = "status transition not allowed")]
fn active_cannot_jump_to_rejected() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    attest(&mut c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Active);
    c.set_issuer_status("iss".into(), Status::Rejected);
}

#[test]
#[should_panic(expected = "status transition not allowed")]
fn rejected_is_terminal() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    attest(&mut c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Rejected);
    c.set_issuer_status("iss".into(), Status::Active);
}

#[test]
#[should_panic(expected = "status transition not allowed")]
fn deprecated_is_terminal() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.set_issuer_status("iss".into(), Status::Deprecated);
    c.set_issuer_status("iss".into(), Status::Restricted);
}

#[test]
#[should_panic(expected = "status transition not allowed")]
fn registrar_cannot_set_paused() {
    let mut c = core();
    active_registry(&mut c);
    c.set_representation_status("tgold-a".into(), Status::Paused);
}

// ---- canonical assets ----

#[test]
fn canonical_asset_activates_when_complete() {
    let mut c = core();
    c.register_canonical_asset(new_asset("gold"));
    attest(&mut c, SubjectType::CanonicalAsset, "gold");
    c.set_canonical_asset_status("gold".into(), Status::Active);
    let a = c.get_canonical_asset("gold".into()).unwrap();
    assert_eq!(a.status, Status::Active);
    assert!(a.synthetic);
    assert_eq!(last_event()["event"], "canonical_asset_status_changed");
}

#[test]
#[should_panic(expected = "unit_definition must not be empty")]
fn canonical_asset_without_unit_definition_cannot_activate() {
    let mut c = core();
    let mut a = new_asset("gold");
    a.unit_definition = "  ".to_string();
    c.register_canonical_asset(a);
    attest(&mut c, SubjectType::CanonicalAsset, "gold");
    c.set_canonical_asset_status("gold".into(), Status::Active);
}

#[test]
#[should_panic(expected = "risk_disclosures must not be empty")]
fn canonical_asset_without_risk_disclosures_cannot_activate() {
    let mut c = core();
    let mut a = new_asset("gold");
    a.risk_disclosures.clear();
    c.register_canonical_asset(a);
    attest(&mut c, SubjectType::CanonicalAsset, "gold");
    c.set_canonical_asset_status("gold".into(), Status::Active);
}

// ---- representations ----

#[test]
#[should_panic(expected = "canonical asset not found")]
fn representation_needs_an_existing_canonical_asset() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
}

#[test]
#[should_panic(expected = "issuer not found")]
fn representation_needs_an_existing_issuer() {
    let mut c = core();
    c.register_canonical_asset(new_asset("gold"));
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
}

#[test]
fn representation_multiplier_is_normalised_and_looked_up_by_account() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.register_canonical_asset(new_asset("gold"));
    let mut r = new_rep("tgold-a", "iss", "gold", token_a());
    r.unit_multiplier = Ratio {
        num: U128(2),
        den: U128(2_000_000),
    };
    c.register_representation(r);
    let rep = c.get_representation("tgold-a".into()).unwrap();
    assert_eq!(
        rep.unit_multiplier,
        Ratio {
            num: U128(1),
            den: U128(1_000_000)
        }
    );
    assert_eq!(rep.status, Status::Restricted);
    assert_eq!(
        c.get_representation_by_account(token_a()).unwrap().id,
        "tgold-a"
    );
    assert!(c.get_representation_by_account(token_b()).is_none());
    assert_eq!(last_event()["event"], "representation_registered");
}

#[test]
#[should_panic(expected = "ratio parts must be positive")]
fn zero_multiplier_is_rejected() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.register_canonical_asset(new_asset("gold"));
    let mut r = new_rep("tgold-a", "iss", "gold", token_a());
    r.unit_multiplier = Ratio {
        num: U128(0),
        den: U128(1),
    };
    c.register_representation(r);
}

#[test]
#[should_panic(expected = "decimals must be at most 38")]
fn excess_decimals_are_rejected() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.register_canonical_asset(new_asset("gold"));
    let mut r = new_rep("tgold-a", "iss", "gold", token_a());
    r.decimals = 39;
    c.register_representation(r);
}

#[test]
#[should_panic(expected = "token account already registered")]
fn a_token_account_can_only_be_registered_once() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.register_canonical_asset(new_asset("gold"));
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
    c.register_representation(new_rep("tgold-a2", "iss", "gold", token_a()));
}

#[test]
#[should_panic(expected = "issuer must be active")]
fn representation_cannot_activate_while_its_issuer_is_not_active() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.register_canonical_asset(new_asset("gold"));
    attest(&mut c, SubjectType::CanonicalAsset, "gold");
    c.set_canonical_asset_status("gold".into(), Status::Active);
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
    attest(&mut c, SubjectType::Representation, "tgold-a");
    c.set_representation_status("tgold-a".into(), Status::Active);
}

#[test]
#[should_panic(expected = "canonical asset must be active")]
fn representation_cannot_activate_while_its_claim_is_not_active() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    attest(&mut c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Active);
    c.register_canonical_asset(new_asset("gold"));
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
    attest(&mut c, SubjectType::Representation, "tgold-a");
    c.set_representation_status("tgold-a".into(), Status::Active);
}

#[test]
#[should_panic(expected = "custody_description must not be empty")]
fn representation_with_a_blank_required_field_cannot_activate() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    attest(&mut c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Active);
    c.register_canonical_asset(new_asset("gold"));
    attest(&mut c, SubjectType::CanonicalAsset, "gold");
    c.set_canonical_asset_status("gold".into(), Status::Active);
    let mut r = new_rep("tgold-a", "iss", "gold", token_a());
    r.custody_description = String::new();
    c.register_representation(r);
    attest(&mut c, SubjectType::Representation, "tgold-a");
    c.set_representation_status("tgold-a".into(), Status::Active);
}

#[test]
fn executable_only_when_everything_is_active_and_unpaused() {
    let mut c = core();
    assert!(
        !c.is_representation_executable("tgold-a".into()),
        "unknown is not executable"
    );
    active_registry(&mut c);
    assert!(c.is_representation_executable("tgold-a".into()));

    // Deprecating the issuer makes its representation non-executable.
    c.set_issuer_status("iss".into(), Status::Deprecated);
    assert!(!c.is_representation_executable("tgold-a".into()));
}

#[test]
fn global_pause_makes_representations_non_executable() {
    let mut c = core();
    active_registry(&mut c);
    as_account(pauser());
    c.pause();
    assert!(!c.is_representation_executable("tgold-a".into()));
}

// ---- evidence ----

#[test]
fn evidence_is_recorded_with_provenance_and_an_event() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.add_evidence(
        SubjectType::Issuer,
        "iss".into(),
        evidence(Provenance::ThirdPartyAttested),
    );
    let e = c.get_issuer("iss".into()).unwrap().evidence;
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].provenance, Provenance::ThirdPartyAttested);
    assert_eq!(e[0].sha256, SHA);
    assert_eq!(e[0].added_by, registrar());
    assert_eq!(e[0].timestamp_ms, 5_000);
    let ev = last_event();
    assert_eq!(ev["event"], "evidence_added");
    assert_eq!(ev["data"]["subject_type"], "issuer");
    assert_eq!(ev["data"]["provenance"], "third_party_attested");
}

#[test]
#[should_panic(expected = "sha256 must be 64 lowercase hex characters")]
fn evidence_rejects_a_short_digest() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    let mut e = evidence(Provenance::IssuerProvided);
    e.sha256 = "abc".to_string();
    c.add_evidence(SubjectType::Issuer, "iss".into(), e);
}

#[test]
#[should_panic(expected = "sha256 must be 64 lowercase hex characters")]
fn evidence_rejects_uppercase_hex() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    let mut e = evidence(Provenance::IssuerProvided);
    e.sha256 = SHA.to_uppercase();
    c.add_evidence(SubjectType::Issuer, "iss".into(), e);
}

#[test]
#[should_panic(expected = "issuer not found")]
fn evidence_needs_an_existing_subject() {
    let mut c = core();
    attest(&mut c, SubjectType::Issuer, "ghost");
}

#[test]
#[should_panic(expected = "cannot add evidence to a rejected record")]
fn rejected_records_take_no_new_evidence() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.set_issuer_status("iss".into(), Status::Rejected);
    attest(&mut c, SubjectType::Issuer, "iss");
}

// ---- per-asset pause ----

#[test]
fn pauser_pauses_one_asset_and_only_the_owner_resumes_it() {
    let mut c = core();
    active_registry(&mut c);
    as_account(pauser());
    c.pause_asset("tgold-a".into());
    assert_eq!(
        c.get_representation("tgold-a".into()).unwrap().status,
        Status::Paused
    );
    assert!(!c.is_representation_executable("tgold-a".into()));
    assert_eq!(last_event()["event"], "representation_status_changed");

    as_account(owner());
    c.unpause_asset("tgold-a".into());
    assert_eq!(
        c.get_representation("tgold-a".into()).unwrap().status,
        Status::Active
    );
    assert!(c.is_representation_executable("tgold-a".into()));
}

#[test]
fn asset_pause_works_during_a_global_pause() {
    let mut c = core();
    active_registry(&mut c);
    as_account(pauser());
    c.pause();
    c.pause_asset("tgold-a".into());
    assert_eq!(
        c.get_representation("tgold-a".into()).unwrap().status,
        Status::Paused
    );
}

#[test]
#[should_panic(expected = "caller is not a pauser")]
fn registrar_cannot_pause_an_asset() {
    let mut c = core();
    active_registry(&mut c);
    c.pause_asset("tgold-a".into());
}

#[test]
#[should_panic(expected = "status transition not allowed")]
fn registrar_cannot_resume_a_paused_asset() {
    let mut c = core();
    active_registry(&mut c);
    as_account(pauser());
    c.pause_asset("tgold-a".into());
    as_account(registrar());
    c.set_representation_status("tgold-a".into(), Status::Active);
}

#[test]
#[should_panic(expected = "only the owner")]
fn pauser_cannot_resume_a_paused_asset() {
    let mut c = core();
    active_registry(&mut c);
    as_account(pauser());
    c.pause_asset("tgold-a".into());
    c.unpause_asset("tgold-a".into());
}

#[test]
#[should_panic(expected = "only an active representation can be paused")]
fn only_active_representations_can_be_paused() {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    c.register_canonical_asset(new_asset("gold"));
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
    as_account(pauser());
    c.pause_asset("tgold-a".into());
}

#[test]
#[should_panic(expected = "issuer must be active")]
fn resuming_rechecks_the_activation_rules() {
    let mut c = core();
    active_registry(&mut c);
    as_account(pauser());
    c.pause_asset("tgold-a".into());
    as_account(registrar());
    c.set_issuer_status("iss".into(), Status::Deprecated);
    as_account(owner());
    c.unpause_asset("tgold-a".into());
}
