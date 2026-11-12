//! The computed route checks of corporate actions (ADR 0017 section 3): freeze, pending and
//! epoch mismatch, `next_freeze_ms`, and the rebase of a relationship whose multipliers moved
//! apart.

use crate::actions_tests::*;
use crate::compat_tests::{approver, ratio};
use crate::conversion_tests::quote_msg;
use crate::registry_tests::registrar;
use crate::registry_tests::token_a;
use crate::tests::{alice, as_account, as_account_at};
use crate::*;

pub(crate) const BEFORE_FREEZE: u64 = FREEZE_FROM - 1;
pub(crate) const AFTER_FREEZE: u64 = FREEZE_UNTIL + 1;

pub(crate) fn route_at(c: &Contract, at: u64) -> RouteView {
    as_account_at(alice(), at);
    c.get_route("tgold-a".into(), "tgold-b".into())
}

pub(crate) fn apply_at(c: &mut Contract, rep: &str, at: u64) {
    let new = if rep == "tgold-a" {
        ratio(1, 2_000_000)
    } else {
        ratio(1, 2_000_000_000)
    };
    as_account_at(registrar(), at);
    c.apply_corporate_action("gold-1".into(), rep.into(), Some(new));
}

/// The reason `ft_on_transfer` would refuse `msg` at block time `at`.
fn refused_at(c: &Contract, msg: &str, at: u64) -> RejectReason {
    as_account_at(token_a(), at);
    c.validate_conversion(
        &token_a(),
        &alice(),
        near_sdk::json_types::U128(1_000_000),
        msg,
    )
    .unwrap_err()
    .reason
}

pub(crate) fn scheduled() -> Contract {
    let mut c = with_actions();
    let id = propose(&mut c, split());
    approve(&mut c, &id);
    c
}

#[test]
fn a_proposed_action_does_not_touch_the_route() {
    let mut c = with_actions();
    propose(&mut c, split());
    let v = route_at(&c, FREEZE_FROM + 1);
    assert!(v.executable);
    assert_eq!(v.next_freeze_ms, None);
}

#[test]
fn an_approved_action_closes_the_route_in_its_freeze_window_only() {
    let c = scheduled();
    let before = route_at(&c, BEFORE_FREEZE);
    assert!(before.executable);
    assert_eq!(before.next_freeze_ms, Some(FREEZE_FROM));
    for at in [FREEZE_FROM, EFFECTIVE, FREEZE_UNTIL - 1] {
        let v = route_at(&c, at);
        assert_eq!(
            v.refusal,
            Some(RouteRefusal::CorporateActionFreeze),
            "at {at}"
        );
        assert_eq!(v.next_freeze_ms, None, "the freeze has started");
    }
}

#[test]
fn until_every_wrapper_has_applied_the_pair_stays_unroutable_after_the_freeze() {
    let mut c = scheduled();
    let pending = Some(RouteRefusal::CorporateActionPending);
    assert_eq!(route_at(&c, AFTER_FREEZE).refusal, pending);
    apply_at(&mut c, "tgold-a", EFFECTIVE);
    assert_eq!(route_at(&c, AFTER_FREEZE).refusal, pending);
}

#[test]
fn both_applied_reopens_the_route_at_the_same_ratio_with_a_new_version() {
    let mut c = scheduled();
    let before = route_at(&c, BEFORE_FREEZE).terms.unwrap();
    apply_at(&mut c, "tgold-a", EFFECTIVE);
    apply_at(&mut c, "tgold-b", EFFECTIVE);
    let after = route_at(&c, AFTER_FREEZE).terms.unwrap();
    assert_eq!(after.ratio, before.ratio);
    assert_eq!(
        after.compatibility_version,
        before.compatibility_version + 2
    );
}

#[test]
fn a_cancelled_action_releases_the_route() {
    let mut c = scheduled();
    as_account_at(approver(), BEFORE_FREEZE);
    c.cancel_corporate_action("gold-1".into(), "Withdrawn".into());
    assert!(route_at(&c, FREEZE_FROM + 1).executable);
}

#[test]
fn a_quote_signed_before_the_split_is_refused_for_the_freeze_then_for_the_version() {
    let mut c = crate::conversion_tests::ready();
    as_account(crate::tests::owner());
    c.grant_role(
        RoleName::CompatApprover,
        crate::guard_route_tests::approver2(),
    );
    let id = propose(&mut c, split());
    approve(&mut c, &id);
    let msg = quote_msg(|_| {});
    assert_eq!(
        refused_at(&c, &msg, FREEZE_FROM),
        RejectReason::CorporateActionFreeze
    );
    apply_at(&mut c, "tgold-a", EFFECTIVE);
    apply_at(&mut c, "tgold-b", EFFECTIVE);
    assert_eq!(
        refused_at(&c, &msg, AFTER_FREEZE),
        RejectReason::CompatibilityChanged
    );
}
