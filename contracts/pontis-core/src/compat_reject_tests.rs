use crate::compat_lifecycle_tests::{approved_parity, attest_pair};
use crate::compat_tests::{approver, propose_parity, two_reps};
use crate::registry_tests::registrar;
use crate::tests::{as_account, last_event};
use crate::*;

fn rel(c: &Contract) -> Compatibility {
    c.get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap()
}

#[test]
fn rejection_is_recorded_with_its_rationale_and_version() {
    let mut c = two_reps();
    propose_parity(&mut c);
    c.reject_compatibility("tgold-a".into(), "tgold-b".into(), "Terms unclear".into());
    let r = rel(&c);
    assert_eq!(r.status, RelationshipStatus::Rejected);
    assert_eq!(r.rationale, "Terms unclear");
    assert_eq!(r.version, 2);
    assert_eq!(r.history[1].action, ReviewAction::Rejected);
    let e = last_event();
    assert_eq!(e["event"], "compatibility_rejected");
    assert_eq!(e["data"]["version"], 2);
}

#[test]
fn a_rejected_relationship_can_be_proposed_again_and_keeps_its_history() {
    let mut c = two_reps();
    propose_parity(&mut c);
    c.reject_compatibility("tgold-a".into(), "tgold-b".into(), "Terms unclear".into());
    propose_parity(&mut c);
    let r = rel(&c);
    assert_eq!(r.status, RelationshipStatus::Proposed);
    assert_eq!(r.version, 3, "versions keep counting across re-proposals");
    assert_eq!(r.history.len(), 3);
    assert_eq!(r.history[1].action, ReviewAction::Rejected);
}

#[test]
#[should_panic(expected = "only a proposed relationship can be rejected")]
fn an_approved_relationship_cannot_be_rejected() {
    let mut c = approved_parity();
    c.reject_compatibility("tgold-a".into(), "tgold-b".into(), "Changed mind".into());
}

#[test]
#[should_panic(expected = "caller is not a compat approver")]
fn registrar_cannot_reject() {
    let mut c = two_reps();
    propose_parity(&mut c);
    as_account(registrar());
    c.reject_compatibility("tgold-a".into(), "tgold-b".into(), "No".into());
}

#[test]
#[should_panic(expected = "cannot add evidence to a rejected relationship")]
fn a_rejected_relationship_takes_no_new_evidence() {
    let mut c = two_reps();
    propose_parity(&mut c);
    c.reject_compatibility("tgold-a".into(), "tgold-b".into(), "No".into());
    attest_pair(&mut c);
}

#[test]
#[should_panic(expected = "only a proposed or suspended relationship can be approved")]
fn a_rejected_relationship_cannot_be_approved_without_a_new_proposal() {
    let mut c = two_reps();
    propose_parity(&mut c);
    attest_pair(&mut c);
    c.reject_compatibility("tgold-a".into(), "tgold-b".into(), "No".into());
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Yes".into());
}

#[test]
fn the_approver_who_proposed_may_also_approve_on_testnet() {
    // ADR 0003 accepted limitation: proposer and approver separation is not enforced on-chain.
    let c = approved_parity();
    let r = rel(&c);
    assert_eq!(r.proposed_by, approver());
    assert_eq!(r.approved_by, Some(approver()));
}
