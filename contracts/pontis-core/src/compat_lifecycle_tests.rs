use crate::compat_tests::{approver, propose_parity, ratio, two_reps};
use crate::registry_tests::{evidence, registrar};
use crate::tests::{as_account, last_event};
use crate::*;

pub(crate) fn attest_pair(c: &mut Contract) {
    c.add_compatibility_evidence(
        "tgold-a".into(),
        "tgold-b".into(),
        evidence(Provenance::IssuerProvided),
    );
}

/// Proposed, evidenced and approved parity relationship (version 2). Context: the approver.
pub(crate) fn approved_parity() -> Contract {
    let mut c = two_reps();
    propose_parity(&mut c);
    attest_pair(&mut c);
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Reviewed".into());
    c
}

fn rel(c: &Contract) -> Compatibility {
    c.get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap()
}

#[test]
fn evidence_is_attached_to_the_relationship_with_an_event() {
    let mut c = two_reps();
    propose_parity(&mut c);
    attest_pair(&mut c);
    assert_eq!(rel(&c).evidence.len(), 1);
    assert_eq!(rel(&c).evidence[0].added_by, approver());
    let e = last_event();
    assert_eq!(e["event"], "evidence_added");
    assert_eq!(e["data"]["subject_type"], "compatibility");
    assert_eq!(e["data"]["subject_id"], "tgold-a:tgold-b");
    assert_eq!(rel(&c).version, 1, "evidence does not bump the version");
}

#[test]
#[should_panic(expected = "caller is not a compat approver")]
fn registrar_cannot_add_compatibility_evidence() {
    let mut c = two_reps();
    propose_parity(&mut c);
    as_account(registrar());
    attest_pair(&mut c);
}

#[test]
#[should_panic(expected = "relationship not found")]
fn evidence_needs_an_existing_relationship() {
    let mut c = two_reps();
    attest_pair(&mut c);
}

#[test]
#[should_panic(expected = "use add_compatibility_evidence")]
fn registry_evidence_cannot_target_a_relationship() {
    let mut c = two_reps();
    propose_parity(&mut c);
    as_account(registrar());
    c.add_evidence(
        SubjectType::Compatibility,
        "tgold-a:tgold-b".into(),
        evidence(Provenance::IssuerProvided),
    );
}

#[test]
fn approval_records_the_approver_and_bumps_the_version() {
    let c = approved_parity();
    let r = rel(&c);
    assert_eq!(r.status, RelationshipStatus::Approved);
    assert_eq!(r.classification, Classification::DirectEquivalent);
    assert_eq!(r.approved_by, Some(approver()));
    assert_eq!(r.rationale, "Reviewed");
    assert_eq!(r.version, 2);
    assert_eq!(r.history.len(), 2);
    assert_eq!(r.history[0].action, ReviewAction::Proposed);
    assert_eq!(r.history[1].action, ReviewAction::Approved);
    assert_eq!(r.history[1].rationale, "Reviewed");
    let e = last_event();
    assert_eq!(e["event"], "compatibility_approved");
    assert_eq!(e["data"]["version"], 2);
    assert_eq!(e["data"]["reapproval"], false);
}

#[test]
fn a_similar_pair_can_be_approved_without_evidence_or_a_matching_ratio() {
    let mut c = two_reps();
    c.propose_compatibility(
        "tgold-a".into(),
        "tgold-b".into(),
        Classification::EconomicallySimilar,
        ratio(7, 3),
        "scope".into(),
        "r".into(),
    );
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Recorded".into());
    assert_eq!(rel(&c).status, RelationshipStatus::Approved);
    assert_eq!(rel(&c).classification, Classification::EconomicallySimilar);
}

#[test]
#[should_panic(expected = "requires at least one evidence reference")]
fn parity_cannot_be_approved_without_evidence() {
    let mut c = two_reps();
    propose_parity(&mut c);
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Reviewed".into());
}

#[test]
#[should_panic(expected = "ratio does not match the representations' unit multipliers")]
fn parity_ratio_must_match_the_unit_multipliers() {
    let mut c = two_reps();
    c.propose_compatibility(
        "tgold-a".into(),
        "tgold-b".into(),
        Classification::DirectEquivalent,
        ratio(999, 1),
        "scope".into(),
        "r".into(),
    );
    attest_pair(&mut c);
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Reviewed".into());
}

#[test]
#[should_panic(expected = "both representations must be active")]
fn approval_needs_both_representations_active() {
    let mut c = two_reps();
    propose_parity(&mut c);
    attest_pair(&mut c);
    as_account(registrar());
    c.set_representation_status("tgold-b".into(), Status::Deprecated);
    as_account(approver());
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Reviewed".into());
}

#[test]
#[should_panic(expected = "only a proposed or suspended relationship can be approved")]
fn an_approved_relationship_cannot_be_approved_again() {
    let mut c = approved_parity();
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Again".into());
}

#[test]
#[should_panic(expected = "caller is not a compat approver")]
fn registrar_cannot_approve() {
    let mut c = two_reps();
    propose_parity(&mut c);
    attest_pair(&mut c);
    as_account(registrar());
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Reviewed".into());
}

#[test]
#[should_panic(expected = "rationale must not be empty")]
fn approval_needs_a_recorded_rationale() {
    let mut c = two_reps();
    propose_parity(&mut c);
    attest_pair(&mut c);
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "".into());
}
