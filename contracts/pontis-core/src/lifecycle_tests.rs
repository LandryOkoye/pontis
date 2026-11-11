//! Lifecycle kind, flags, stages and the two-step delisting (ADR 0018 sections 1 to 3).

use crate::actions_tests::with_actions;
use crate::compat_tests::approver;
use crate::registry_tests::registrar;
use crate::tests::{alice, as_account, last_event};
use crate::*;

pub(crate) const HASH: &str = "a3f1c2d4e5b60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

pub(crate) fn route(c: &Contract) -> RouteView {
    as_account(alice());
    c.get_route("tgold-a".into(), "tgold-b".into())
}

pub(crate) fn flags(c: &mut Contract, rep: &str, kind: AssetKind, no_conv: bool, bridge: bool) {
    as_account(registrar());
    c.set_lifecycle_flags(rep.into(), kind, no_conv, bridge);
}

pub(crate) fn stage(c: &mut Contract, rep: &str, to: LifecycleStage) {
    as_account(registrar());
    c.set_lifecycle_stage(rep.into(), to, Some(HASH.into()), "Per the terms".into());
}

pub(crate) fn life(c: &Contract, rep: &str) -> Lifecycle {
    c.get_lifecycle(rep.into()).unwrap()
}

#[test]
fn an_unconfigured_asset_is_fungible_and_active_and_routes_as_before() {
    let c = with_actions();
    let l = life(&c, "tgold-a");
    assert_eq!(l.kind, AssetKind::Fungible);
    assert_eq!(l.stage, LifecycleStage::Active);
    assert!(!l.no_conversion && !l.bridge_only && l.history.is_empty());
    assert!(route(&c).executable);
    assert!(c.get_lifecycle("nope".into()).is_none());
}

#[test]
fn no_conversion_refuses_either_side_and_bumps_the_version_and_emits() {
    let mut c = with_actions();
    let before = route(&c).terms.unwrap().compatibility_version;
    flags(&mut c, "tgold-b", AssetKind::Unique, true, false);
    assert_eq!(last_event()["event"], "lifecycle_flags_changed");
    assert_eq!(route(&c).refusal, Some(RouteRefusal::NotConvertible));
    flags(&mut c, "tgold-b", AssetKind::Fungible, false, false);
    let after = route(&c).terms.unwrap().compatibility_version;
    assert_eq!(after, before + 2, "each flag change is a version");
}

#[test]
fn bridge_only_implies_no_conversion() {
    let mut c = with_actions();
    flags(&mut c, "tgold-a", AssetKind::Unique, false, true);
    assert!(life(&c, "tgold-a").no_conversion);
    assert_eq!(route(&c).refusal, Some(RouteRefusal::NotConvertible));
}

#[test]
#[should_panic(expected = "caller is not a registrar")]
fn only_a_registrar_sets_flags() {
    let mut c = with_actions();
    as_account(approver());
    c.set_lifecycle_flags("tgold-a".into(), AssetKind::Unique, true, false);
}

#[test]
#[should_panic(expected = "representation not found")]
fn flags_need_an_existing_representation() {
    let mut c = with_actions();
    flags(&mut c, "nope", AssetKind::Unique, true, false);
}

#[test]
fn a_term_instrument_matures_redeems_and_blocks_the_route() {
    let mut c = with_actions();
    flags(&mut c, "tgold-a", AssetKind::TermInstrument, false, false);
    stage(&mut c, "tgold-a", LifecycleStage::Matured);
    let e = last_event();
    assert_eq!(e["event"], "lifecycle_stage_changed");
    assert_eq!(e["data"]["to"], "matured");
    assert_eq!(route(&c).refusal, Some(RouteRefusal::LifecycleBlocked));
    stage(&mut c, "tgold-a", LifecycleStage::Redeeming);
    stage(&mut c, "tgold-a", LifecycleStage::Redeemed);
    let l = life(&c, "tgold-a");
    assert_eq!(l.history.len(), 3);
    assert_eq!(l.history[0].from, LifecycleStage::Active);
    assert_eq!(l.history[2].to, LifecycleStage::Redeemed);
    assert_eq!(l.history[0].evidence_hash.as_deref(), Some(HASH));
    assert_eq!(l.history[0].by, registrar());
}

#[test]
#[should_panic(expected = "only a term_instrument can mature or be redeemed")]
fn only_a_term_instrument_matures() {
    let mut c = with_actions();
    stage(&mut c, "tgold-a", LifecycleStage::Matured);
}

#[test]
#[should_panic(expected = "this lifecycle transition is not allowed")]
fn stages_cannot_be_skipped() {
    let mut c = with_actions();
    flags(&mut c, "tgold-a", AssetKind::TermInstrument, false, false);
    stage(&mut c, "tgold-a", LifecycleStage::Redeeming);
}

#[test]
#[should_panic(expected = "this lifecycle transition is not allowed")]
fn the_nav_window_stage_is_never_stored() {
    let mut c = with_actions();
    stage(&mut c, "tgold-a", LifecycleStage::NavStrikeWindow);
}

#[test]
#[should_panic(expected = "delisting is two steps")]
fn delisting_is_not_a_plain_stage_change() {
    let mut c = with_actions();
    stage(&mut c, "tgold-a", LifecycleStage::Delisted);
}

#[test]
#[should_panic(expected = "sha256 must be 64 lowercase hex characters")]
fn the_evidence_hash_must_be_a_sha256() {
    let mut c = with_actions();
    as_account(registrar());
    c.set_lifecycle_stage(
        "tgold-a".into(),
        LifecycleStage::Matured,
        Some("abc".into()),
        "Bad".into(),
    );
}
