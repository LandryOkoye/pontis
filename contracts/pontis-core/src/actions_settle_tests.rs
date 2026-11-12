//! Settling actions that need no multiplier change, and closing a split whose wrapper went away
//! (ADR 0017 section 2).

use crate::actions_apply_tests::*;
use crate::actions_tests::*;
use crate::compat_tests::ratio;
use crate::registry_tests::registrar;
use crate::tests::{as_account, as_account_at, last_event};
use crate::*;

#[test]
fn an_action_without_a_change_is_settled_not_applied_to_a_multiplier() {
    let mut c = with_actions();
    let id = propose(&mut c, dividend());
    approve(&mut c, &id);
    as_account_at(registrar(), EFFECTIVE);
    c.apply_corporate_action(id.clone(), "tgold-a".into(), None);
    assert_eq!(
        c.get_multiplier_epochs("tgold-a".into()).len(),
        1,
        "no epoch"
    );
    c.settle_corporate_action(id);
    assert_eq!(action(&c).status, ActionStatus::Applied);
    assert_eq!(last_event()["data"]["complete"], true);
}

#[test]
#[should_panic(expected = "this action has no multiplier change")]
fn an_action_without_a_change_takes_no_new_multiplier() {
    let mut c = with_actions();
    let id = propose(&mut c, dividend());
    approve(&mut c, &id);
    as_account_at(registrar(), EFFECTIVE);
    c.apply_corporate_action(id, "tgold-a".into(), Some(ratio(1, 1_000_000)));
}

#[test]
#[should_panic(expected = "the action is not effective yet")]
fn settling_waits_for_the_effective_time() {
    let mut c = with_actions();
    let id = propose(&mut c, dividend());
    approve(&mut c, &id);
    as_account_at(registrar(), EFFECTIVE - 1);
    c.settle_corporate_action(id);
}

#[test]
#[should_panic(expected = "a wrapper has not applied this action")]
fn a_split_cannot_be_settled_while_a_live_wrapper_has_not_applied() {
    let mut c = approved_split();
    c.settle_corporate_action("gold-1".into());
}

#[test]
fn a_split_settles_once_the_unapplied_wrapper_is_deprecated() {
    let mut c = approved_split();
    apply(&mut c, "tgold-a", Some(halved("tgold-a")));
    as_account(registrar());
    c.set_representation_status("tgold-b".into(), Status::Deprecated);
    as_account_at(registrar(), EFFECTIVE);
    c.settle_corporate_action("gold-1".into());
    assert_eq!(action(&c).status, ActionStatus::Applied);
}
