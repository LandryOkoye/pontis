use crate::compat_lifecycle_tests::approved_parity;
use crate::compat_tests::{ratio, two_reps};
use crate::registry_tests::{pauser, registrar};
use crate::tests::{as_account, owner};
use crate::*;

fn refusal(c: &Contract, from: &str, to: &str) -> Option<RouteRefusal> {
    let view = c.get_route(from.into(), to.into());
    assert_eq!(view.executable, view.refusal.is_none());
    assert_eq!(view.terms.is_some(), view.executable);
    view.refusal
}

/// An approved relationship of the given non-parity classification.
fn approved_as(class: Classification) -> Contract {
    let mut c = two_reps();
    c.propose_compatibility(
        "tgold-a".into(),
        "tgold-b".into(),
        class,
        ratio(1000, 1),
        "scope".into(),
        "r".into(),
    );
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Recorded".into());
    c
}

#[test]
fn an_approved_direct_equivalent_pair_is_executable_in_both_directions() {
    let c = approved_parity();
    let ab = c
        .get_route("tgold-a".into(), "tgold-b".into())
        .terms
        .unwrap();
    assert_eq!(ab.ratio, ratio(1000, 1));
    assert_eq!(ab.compatibility_version, 2);
    assert_eq!(ab.policy_version, 1);
    let ba = c
        .get_route("tgold-b".into(), "tgold-a".into())
        .terms
        .unwrap();
    assert_eq!(
        ba.ratio,
        ratio(1, 1000),
        "the reverse direction uses the reciprocal"
    );
    assert_eq!(ba.compatibility_version, 2);
}

#[test]
fn without_a_relationship_there_is_no_route() {
    let c = two_reps();
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::NoRelationship)
    );
}

#[test]
fn a_merely_proposed_or_rejected_relationship_is_not_enough() {
    let mut c = two_reps();
    crate::compat_tests::propose_parity(&mut c);
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::RelationshipNotApproved)
    );
    c.reject_compatibility("tgold-a".into(), "tgold-b".into(), "No".into());
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::RelationshipNotApproved)
    );
}

fn assert_never_parity(class: Classification) {
    let c = approved_as(class);
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::NotDirectEquivalent)
    );
    assert_eq!(
        refusal(&c, "tgold-b", "tgold-a"),
        Some(RouteRefusal::NotDirectEquivalent)
    );
}

#[test]
fn an_approved_similar_pair_never_enables_parity() {
    assert_never_parity(Classification::EconomicallySimilar);
}

#[test]
fn an_approved_incompatible_pair_never_enables_parity() {
    assert_never_parity(Classification::Incompatible);
}

#[test]
fn suspension_blocks_the_route_immediately_and_reapproval_reopens_it_at_a_new_version() {
    let mut c = approved_parity();
    c.suspend_compatibility("tgold-a".into(), "tgold-b".into(), "Stale".into());
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::RelationshipSuspended)
    );
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "Re-reviewed".into());
    let terms = c
        .get_route("tgold-a".into(), "tgold-b".into())
        .terms
        .unwrap();
    assert_eq!(
        terms.compatibility_version, 4,
        "old quotes bound to version 2 no longer match"
    );
}

#[test]
fn a_paused_asset_or_a_global_pause_blocks_the_route() {
    let mut c = approved_parity();
    as_account(pauser());
    c.pause_asset("tgold-b".into());
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::AssetPaused)
    );
    as_account(owner());
    c.unpause_asset("tgold-b".into());
    assert!(c.get_route("tgold-a".into(), "tgold-b".into()).executable);
    as_account(pauser());
    c.pause();
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::AssetPaused)
    );
}

#[test]
fn an_unknown_asset_blocks_the_route() {
    let c = approved_parity();
    assert_eq!(
        refusal(&c, "tgold-a", "ghost"),
        Some(RouteRefusal::AssetNotFound)
    );
}

#[test]
fn a_deprecated_issuer_blocks_the_route() {
    let mut c = approved_parity();
    as_account(registrar());
    c.set_issuer_status("iss".into(), Status::Deprecated);
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::AssetNotActive)
    );
}

#[test]
fn a_deprecated_representation_blocks_the_route() {
    let mut c = approved_parity();
    as_account(registrar());
    c.set_representation_status("tgold-a".into(), Status::Deprecated);
    assert_eq!(
        refusal(&c, "tgold-a", "tgold-b"),
        Some(RouteRefusal::AssetNotActive)
    );
}

#[test]
fn route_terms_carry_the_current_policy_version() {
    let mut c = approved_parity();
    as_account(registrar());
    c.set_allowlist_required("tgold-a".into(), false);
    assert_eq!(
        c.get_route("tgold-a".into(), "tgold-b".into())
            .terms
            .unwrap()
            .policy_version,
        2
    );
}
