//! Corporate action approval and cancellation (ADR 0017 sections 1 and 4).

use crate::actions_tests::*;
use crate::compat_tests::approver;
use crate::guard_route_tests::approver2;
use crate::tests::{as_account, as_account_at, last_event, owner};
use crate::*;

#[test]
fn a_different_approver_approves_before_the_effective_time() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    approve(&mut c, &id);
    let a = action(&c);
    assert_eq!(a.status, ActionStatus::Approved);
    assert_eq!(a.approved_by, Some(approver2()));
    assert_eq!(a.history.len(), 2);
    assert_eq!(last_event()["event"], "corporate_action_approved");
}

#[test]
#[should_panic(expected = "the proposer cannot approve their own action")]
fn the_proposer_cannot_approve_even_with_both_roles() {
    let mut c = with_actions();
    as_account(owner());
    c.grant_role(RoleName::Registrar, approver());
    as_account(approver());
    let id = c.propose_corporate_action(split());
    c.approve_corporate_action(id, "Mine".into());
}

#[test]
#[should_panic(expected = "caller is not a compat approver")]
fn a_registrar_cannot_approve() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    c.approve_corporate_action(id, "Mine".into());
}

#[test]
#[should_panic(expected = "the action is already effective")]
fn an_action_cannot_be_approved_after_its_effective_time() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    as_account_at(approver2(), EFFECTIVE);
    c.approve_corporate_action(id, "Late".into());
}

#[test]
fn a_proposed_or_approved_action_can_be_cancelled_before_it_is_effective() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    as_account(approver());
    c.cancel_corporate_action(id.clone(), "Issuer withdrew".into());
    assert_eq!(action(&c).status, ActionStatus::Cancelled);
    assert_eq!(last_event()["event"], "corporate_action_cancelled");
    let id = propose(&mut c, split());
    approve(&mut c, &id);
    as_account(approver());
    c.cancel_corporate_action(id, "Issuer withdrew".into());
    assert_eq!(
        c.get_corporate_actions("gold".into())[1].status,
        ActionStatus::Cancelled
    );
}

#[test]
#[should_panic(expected = "the action is already effective")]
fn an_approved_action_cannot_be_cancelled_once_effective() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    approve(&mut c, &id);
    as_account_at(approver(), EFFECTIVE);
    c.cancel_corporate_action(id, "Too late".into());
}

#[test]
#[should_panic(expected = "the action is already applied or cancelled")]
fn a_cancelled_action_cannot_be_cancelled_again() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    as_account(approver());
    c.cancel_corporate_action(id.clone(), "One".into());
    c.cancel_corporate_action(id, "Two".into());
}
