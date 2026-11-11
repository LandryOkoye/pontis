//! Applying actions to wrappers: the exact-factor rule, epochs, version bumps and completion
//! (ADR 0017 section 2).

use crate::actions_tests::*;
use crate::compat_tests::{approver, ratio};
use crate::registry_tests::registrar;
use crate::tests::{as_account_at, last_event};
use crate::*;

/// An approved 2:1 split, the context left as the registrar at `EFFECTIVE`.
pub(crate) fn approved_split() -> Contract {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    approve(&mut c, &id);
    as_account_at(registrar(), EFFECTIVE);
    c
}

/// tgold-a: 1/1,000,000 halves to 1/2,000,000.
pub(crate) fn apply(c: &mut Contract, rep: &str, new: Option<Ratio>) {
    as_account_at(registrar(), EFFECTIVE);
    c.apply_corporate_action("gold-1".into(), rep.into(), new);
}

pub(crate) fn halved(rep: &str) -> Ratio {
    match rep {
        "tgold-a" => ratio(1, 2_000_000),
        _ => ratio(1, 2_000_000_000),
    }
}

fn version(c: &Contract) -> u64 {
    c.get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap()
        .version
}

#[test]
fn every_representation_starts_with_a_genesis_epoch() {
    let c = with_actions();
    let epochs = c.get_multiplier_epochs("tgold-a".into());
    assert_eq!(epochs.len(), 1);
    assert_eq!(epochs[0].effective_ms, 0);
    assert_eq!(epochs[0].action_id, "genesis");
    assert_eq!(epochs[0].multiplier, ratio(1, 1_000_000));
}

#[test]
fn applying_appends_an_epoch_bumps_the_version_and_emits_events() {
    let mut c = approved_split();
    let before = version(&c);
    apply(&mut c, "tgold-a", Some(halved("tgold-a")));
    let epochs = c.get_multiplier_epochs("tgold-a".into());
    assert_eq!(epochs.len(), 2);
    assert_eq!(epochs[1].effective_ms, EFFECTIVE);
    assert_eq!(epochs[1].multiplier, ratio(1, 2_000_000));
    assert_eq!(epochs[1].action_id, "gold-1");
    assert_eq!(version(&c), before + 1);
    assert_eq!(last_event()["event"], "corporate_action_applied");
    assert_eq!(last_event()["data"]["complete"], false);
    assert_eq!(action(&c).status, ActionStatus::Approved);
    assert_eq!(action(&c).applied_representations, vec!["tgold-a"]);
}

#[test]
fn the_action_is_applied_when_every_representation_has_applied() {
    let mut c = approved_split();
    apply(&mut c, "tgold-a", Some(halved("tgold-a")));
    apply(&mut c, "tgold-b", Some(halved("tgold-b")));
    assert_eq!(action(&c).status, ActionStatus::Applied);
    assert_eq!(last_event()["data"]["complete"], true);
    assert_eq!(action(&c).history.len(), 3);
}

#[test]
#[should_panic(
    expected = "new_multiplier must equal the previous multiplier times the approved change"
)]
fn a_different_factor_than_the_approved_one_is_refused() {
    let mut c = approved_split();
    apply(&mut c, "tgold-a", Some(ratio(1, 3_000_000)));
}

#[test]
#[should_panic(
    expected = "new_multiplier must equal the previous multiplier times the approved change"
)]
fn leaving_the_multiplier_unchanged_is_not_the_approved_factor() {
    let mut c = approved_split();
    apply(&mut c, "tgold-a", Some(ratio(1, 1_000_000)));
}

#[test]
#[should_panic(expected = "new_multiplier is required for this action")]
fn an_action_with_a_change_needs_the_new_multiplier() {
    let mut c = approved_split();
    apply(&mut c, "tgold-a", None);
}

#[test]
#[should_panic(expected = "the representation has already applied this action")]
fn a_representation_applies_an_action_once() {
    let mut c = approved_split();
    apply(&mut c, "tgold-a", Some(halved("tgold-a")));
    apply(&mut c, "tgold-a", Some(halved("tgold-a")));
}

#[test]
#[should_panic(expected = "only an approved action can be applied")]
fn a_proposed_action_cannot_be_applied() {
    let mut c = with_actions();
    propose(&mut c, split());
    apply(&mut c, "tgold-a", Some(halved("tgold-a")));
}

#[test]
#[should_panic(expected = "the action is not effective yet")]
fn an_action_cannot_be_applied_before_it_is_effective() {
    let mut c = approved_split();
    as_account_at(registrar(), EFFECTIVE - 1);
    c.apply_corporate_action("gold-1".into(), "tgold-a".into(), Some(halved("tgold-a")));
}

#[test]
#[should_panic(expected = "caller is not a registrar")]
fn only_a_registrar_applies() {
    let mut c = approved_split();
    as_account_at(approver(), EFFECTIVE);
    c.apply_corporate_action("gold-1".into(), "tgold-a".into(), Some(halved("tgold-a")));
}

#[test]
#[should_panic(expected = "a wrapper has already applied this action")]
fn an_action_a_wrapper_applied_cannot_be_cancelled() {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    approve(&mut c, &id);
    // Applying is only possible once effective, which already forbids cancelling; the
    // applied-list check stands behind it for a clock that is read twice.
    as_account_at(registrar(), EFFECTIVE);
    c.apply_corporate_action(id.clone(), "tgold-a".into(), Some(halved("tgold-a")));
    as_account_at(approver(), EFFECTIVE - 1);
    c.cancel_corporate_action(id, "Retract".into());
}
