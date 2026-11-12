//! Corporate action records: propose, evidence, approve, cancel (ADR 0017 sections 1 and 4).
//! The pair is the demo one: `tgold-a` and `tgold-b`, two wrappers of the claim `gold`.

use crate::compat_lifecycle_tests::approved_parity;
use crate::compat_tests::{approver, ratio};
use crate::guard_route_tests::approver2;
use crate::registry_tests::{evidence, registrar};
use crate::tests::{as_account, last_event, owner};
use crate::*;

pub(crate) const ANNOUNCED: u64 = 5_000;
pub(crate) const FREEZE_FROM: u64 = 15_000;
pub(crate) const EFFECTIVE: u64 = 20_000;
pub(crate) const FREEZE_UNTIL: u64 = 25_000;

/// A 2:1 split of `gold`: every wrapper's multiplier is halved at `EFFECTIVE`.
pub(crate) fn split() -> NewCorporateAction {
    NewCorporateAction {
        asset_id: "gold".into(),
        kind: ActionKind::Split,
        announced_at_ms: ANNOUNCED,
        ex_date_ms: 18_000,
        effective_ms: EFFECTIVE,
        freeze_from_ms: FREEZE_FROM,
        freeze_until_ms: FREEZE_UNTIL,
        multiplier_change: Some(ratio(1, 2)),
    }
}

pub(crate) fn dividend() -> NewCorporateAction {
    NewCorporateAction {
        kind: ActionKind::DividendCash,
        multiplier_change: None,
        ..split()
    }
}

/// An approved parity pair, a second approver, the context left as the registrar.
pub(crate) fn with_actions() -> Contract {
    let mut c = approved_parity();
    as_account(owner());
    c.grant_role(RoleName::CompatApprover, approver2());
    as_account(registrar());
    c
}

pub(crate) fn propose(c: &mut Contract, action: NewCorporateAction) -> String {
    as_account(registrar());
    c.propose_corporate_action(action)
}

pub(crate) fn approve(c: &mut Contract, id: &str) {
    as_account(approver2());
    c.approve_corporate_action(id.into(), "Reviewed".into());
}

/// Proposes `base` after `edit`, on a fresh pair, to see what validation says.
fn proposing(mut base: NewCorporateAction, edit: impl FnOnce(&mut NewCorporateAction)) {
    edit(&mut base);
    propose(&mut with_actions(), base);
}

pub(crate) fn action(c: &Contract) -> CorporateAction {
    c.get_corporate_actions("gold".into()).remove(0)
}

#[test]
fn a_registrar_proposes_an_action_with_an_id_history_and_event() {
    let mut c = with_actions();
    let mut unreduced = split();
    unreduced.multiplier_change = Some(ratio(3, 6));
    let id = propose(&mut c, unreduced);
    assert_eq!(id, "gold-1");
    let a = action(&c);
    assert_eq!(a.status, ActionStatus::Proposed);
    assert_eq!(a.proposed_by, registrar());
    assert_eq!(
        a.multiplier_change,
        Some(ratio(1, 2)),
        "stored in lowest terms"
    );
    assert_eq!(a.history.len(), 1);
    let e = last_event();
    assert_eq!(e["event"], "corporate_action_proposed");
    assert_eq!(e["data"]["id"], "gold-1");
    assert_eq!(e["data"]["kind"], "split");
    assert_eq!(propose(&mut c, dividend()), "gold-2");
}

#[test]
#[should_panic(expected = "caller is not a registrar")]
fn only_a_registrar_proposes() {
    let mut c = with_actions();
    as_account(approver());
    c.propose_corporate_action(split());
}

#[test]
#[should_panic(expected = "canonical asset not found")]
fn the_asset_must_exist() {
    proposing(split(), |a| a.asset_id = "silver".into());
}

#[test]
#[should_panic(expected = "the freeze window must contain effective_ms")]
fn the_freeze_window_must_contain_the_effective_time() {
    proposing(split(), |a| a.freeze_until_ms = EFFECTIVE - 1);
}

#[test]
#[should_panic(expected = "announced_at_ms must not be after freeze_from_ms")]
fn the_announcement_comes_before_the_freeze() {
    proposing(split(), |a| a.announced_at_ms = FREEZE_FROM + 1);
}

#[test]
#[should_panic(expected = "a split or reverse_split needs a multiplier_change")]
fn a_split_needs_a_multiplier_change() {
    proposing(split(), |a| a.multiplier_change = None);
}

#[test]
#[should_panic(expected = "this kind of action may not change the multiplier")]
fn a_cash_dividend_may_not_change_the_multiplier() {
    proposing(dividend(), |a| a.multiplier_change = Some(ratio(1, 2)));
}

#[test]
#[should_panic(expected = "ratio parts must be positive")]
fn the_multiplier_change_must_be_positive() {
    proposing(split(), |a| a.multiplier_change = Some(ratio(0, 2)));
}

#[test]
#[should_panic(expected = "too many corporate actions on this asset")]
fn an_asset_takes_at_most_32_actions() {
    let mut c = with_actions();
    for _ in 0..33 {
        propose(&mut c, dividend());
    }
}

#[test]
fn evidence_is_added_to_a_proposed_action_with_an_event() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    c.add_corporate_action_evidence(id, evidence(Provenance::ThirdPartyAttested));
    assert_eq!(action(&c).evidence.len(), 1);
    assert_eq!(action(&c).evidence[0].added_by, registrar());
    assert_eq!(last_event()["event"], "corporate_action_evidence_added");
}
