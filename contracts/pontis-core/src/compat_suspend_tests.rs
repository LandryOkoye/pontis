use crate::compat_lifecycle_tests::approved_parity;
use crate::compat_tests::approver;
use crate::registry_tests::{pauser, registrar};
use crate::tests::{as_account, last_event};
use crate::*;

fn rel(c: &Contract) -> Compatibility {
    c.get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap()
}

fn suspend(c: &mut Contract) {
    c.suspend_compatibility(
        "tgold-a".into(),
        "tgold-b".into(),
        "Evidence is stale".into(),
    );
}

#[test]
fn an_approver_suspends_immediately_and_the_version_moves() {
    let mut c = approved_parity();
    suspend(&mut c);
    let r = rel(&c);
    assert_eq!(r.status, RelationshipStatus::Suspended);
    assert_eq!(r.classification, Classification::Suspended);
    assert_eq!(r.version, 3);
    assert_eq!(r.rationale, "Evidence is stale");
    assert_eq!(r.history[2].action, ReviewAction::Suspended);
    let e = last_event();
    assert_eq!(e["event"], "compatibility_suspended");
    assert_eq!(e["data"]["version"], 3);
}

#[test]
fn a_pauser_can_suspend_and_it_works_during_a_global_pause() {
    let mut c = approved_parity();
    as_account(pauser());
    c.pause();
    suspend(&mut c);
    assert_eq!(rel(&c).status, RelationshipStatus::Suspended);
}

#[test]
#[should_panic(expected = "neither a pauser nor a compat approver")]
fn a_registrar_cannot_suspend() {
    let mut c = approved_parity();
    as_account(registrar());
    suspend(&mut c);
}

#[test]
#[should_panic(expected = "only an approved relationship can be suspended")]
fn only_an_approved_relationship_can_be_suspended() {
    let mut c = approved_parity();
    suspend(&mut c);
    suspend(&mut c);
}

#[test]
fn reapproval_restores_the_classification_as_a_new_version_and_keeps_history() {
    let mut c = approved_parity();
    let before = rel(&c).history;
    suspend(&mut c);
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Re-reviewed".into());
    let r = rel(&c);
    assert_eq!(r.status, RelationshipStatus::Approved);
    assert_eq!(r.classification, Classification::DirectEquivalent);
    assert_eq!(r.version, 4);
    assert_eq!(r.history.len(), 4);
    assert_eq!(r.history[3].action, ReviewAction::Reapproved);
    assert_eq!(r.history[..2].len(), before.len());
    for (old, kept) in before.iter().zip(&r.history) {
        assert_eq!(old.version, kept.version);
        assert_eq!(
            old.rationale, kept.rationale,
            "history entries are never rewritten"
        );
        assert_eq!(old.timestamp_ms, kept.timestamp_ms);
    }
    let e = last_event();
    assert_eq!(e["event"], "compatibility_approved");
    assert_eq!(e["data"]["reapproval"], true);
    assert_eq!(e["data"]["classification"], "DIRECT_EQUIVALENT");
}

#[test]
fn history_versions_are_consecutive_across_the_whole_lifecycle() {
    let mut c = approved_parity();
    suspend(&mut c);
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Re-reviewed".into());
    suspend(&mut c);
    let versions: Vec<u64> = rel(&c).history.iter().map(|v| v.version).collect();
    assert_eq!(versions, [1, 2, 3, 4, 5]);
    assert_eq!(rel(&c).version, 5);
    let _ = approver();
}

#[test]
#[should_panic(expected = "both representations must be active")]
fn reapproval_is_refused_while_a_representation_is_inactive() {
    let mut c = approved_parity();
    suspend(&mut c);
    as_account(registrar());
    c.set_representation_status("tgold-a".into(), Status::Deprecated);
    as_account(approver());
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Re-reviewed".into());
}
