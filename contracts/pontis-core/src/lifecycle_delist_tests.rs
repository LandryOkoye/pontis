//! Two-step delisting, flag freezing and the guard breakdown (ADR 0018 section 2).

use crate::actions_tests::{approve, propose, split, with_actions, FREEZE_FROM};
use crate::compat_tests::approver;
use crate::guard_route_tests::approver2;
use crate::lifecycle_tests::*;
use crate::registry_tests::registrar;
use crate::tests::{alice, as_account, as_account_at, last_event};
use crate::*;

#[test]
fn delisting_takes_a_request_and_a_different_approver() {
    let mut c = with_actions();
    as_account(registrar());
    c.request_delist("tgold-a".into(), Some(HASH.into()), "Issuer left".into());
    assert_eq!(last_event()["event"], "delist_requested");
    assert!(route(&c).executable, "a request alone changes nothing");
    as_account(approver2());
    c.approve_delist("tgold-a".into());
    assert_eq!(last_event()["data"]["to"], "delisted");
    let l = life(&c, "tgold-a");
    assert_eq!(l.stage, LifecycleStage::Delisted);
    assert_eq!(l.history[0].by, approver2());
    assert!(l.history[0].note.contains("requested by registrar.testnet"));
    assert!(l.delist_request.is_none());
    assert_eq!(route(&c).refusal, Some(RouteRefusal::LifecycleBlocked));
}

#[test]
#[should_panic(expected = "the requester cannot approve their own delisting")]
fn the_requester_cannot_approve_the_delisting() {
    let mut c = with_actions();
    as_account(crate::tests::owner());
    c.grant_role(RoleName::Registrar, approver());
    as_account(approver());
    c.request_delist("tgold-a".into(), None, "Mine".into());
    c.approve_delist("tgold-a".into());
}

#[test]
#[should_panic(expected = "no delist request is open")]
fn approving_needs_a_request() {
    let mut c = with_actions();
    as_account(approver());
    c.approve_delist("tgold-a".into());
}

#[test]
#[should_panic(expected = "flags can only change while the stage is active")]
fn flags_are_frozen_once_the_stage_moves() {
    let mut c = with_actions();
    flags(&mut c, "tgold-a", AssetKind::TermInstrument, false, false);
    stage(&mut c, "tgold-a", LifecycleStage::Matured);
    flags(&mut c, "tgold-a", AssetKind::Fungible, false, false);
}

#[test]
#[should_panic(expected = "this representation cannot be delisted from its current stage")]
fn a_redeeming_instrument_cannot_be_delisted() {
    let mut c = with_actions();
    flags(&mut c, "tgold-a", AssetKind::TermInstrument, false, false);
    stage(&mut c, "tgold-a", LifecycleStage::Matured);
    stage(&mut c, "tgold-a", LifecycleStage::Redeeming);
    as_account_at(registrar(), 6_000);
    c.request_delist("tgold-a".into(), None, "Early".into());
}

#[test]
fn the_guard_breakdown_names_each_action_and_lifecycle_check() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    approve(&mut c, &id);
    as_account_at(alice(), FREEZE_FROM);
    let g = c.get_route_guards("tgold-a".into(), "tgold-b".into(), None);
    let line = |name: &str| g.checks.iter().find(|l| l.name == name).unwrap().passed;
    assert!(!g.executable);
    assert!(!line("corporate_action_freeze"));
    assert!(line("corporate_action_pending"));
    assert!(line("epoch_mismatch"));
    assert!(line("not_convertible"));
    assert!(line("lifecycle_blocked"));
    assert!(line("nav_window_closed"));
}
