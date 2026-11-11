use crate::compat_lifecycle_tests::approved_parity;
use crate::custody_fixture::*;
use crate::tests::{as_account, as_account_at};
use crate::*;
use near_sdk::json_types::U128;

fn status(c: &Contract) -> ReserveStatus {
    c.get_reserve_status("tgold-a".into())
}

fn route_refusal(c: &Contract) -> Option<RouteRefusal> {
    c.get_route("tgold-a".into(), "tgold-b".into()).refusal
}

#[test]
fn a_representation_without_a_policy_is_unmonitored_and_never_refused() {
    let c = custody_core(ReserveAction::PauseMint);
    let s = c.get_reserve_status("tgold-b".into());
    assert!(!s.monitored);
    assert_eq!(s.state, ReserveState::Unmonitored);
    assert!(!s.restricts_conversions && !s.mint_paused);
    assert!(c.check_reserves("tgold-b", "tgold-b").is_ok());
}

#[test]
fn no_attestation_is_flagged_and_restricts_under_an_action() {
    let c = custody_core(ReserveAction::RestrictConversions);
    let s = status(&c);
    assert_eq!(s.state, ReserveState::NoAttestation);
    assert!(s.restricts_conversions && !s.mint_paused);
    assert_eq!(
        c.check_reserves("tgold-a", "tgold-b"),
        Err(RouteRefusal::ReserveStale)
    );
}

#[test]
fn warn_flags_but_never_refuses() {
    let c = custody_core(ReserveAction::Warn);
    assert_eq!(status(&c).state, ReserveState::NoAttestation);
    assert!(!status(&c).restricts_conversions);
    assert!(c.check_reserves("tgold-a", "tgold-b").is_ok());
}

#[test]
fn fresh_reserves_above_supply_are_ok_with_headroom() {
    let mut c = custody_core(ReserveAction::PauseMint);
    submit(&mut c, 10 * ONE);
    c.supply_ledger.insert("tgold-a".into(), 4 * ONE);
    let s = status(&c);
    assert_eq!(s.state, ReserveState::Ok);
    assert_eq!(s.attested_units, U128(10 * ONE));
    assert_eq!(s.circulating_units, U128(4 * ONE));
    assert_eq!(s.headroom_units, U128(6 * ONE));
    assert_eq!(s.ratio_bps, Some(25_000));
    assert!(s.simulated);
    assert_eq!(s.sources, vec!["simulated_custodian"]);
    assert!(c.check_reserves("tgold-a", "tgold-b").is_ok());
}

#[test]
fn supply_over_reserves_breaches_and_a_new_attestation_clears_it() {
    let mut c = custody_core(ReserveAction::RestrictConversions);
    submit_at(&mut c, 10 * ONE, 4_000, 5_000);
    c.supply_ledger.insert("tgold-a".into(), 10 * ONE + 1);
    let s = status(&c);
    assert_eq!(s.state, ReserveState::Breached);
    assert_eq!(s.headroom_units, U128(0));
    assert_eq!(
        c.check_reserves("tgold-a", "tgold-b"),
        Err(RouteRefusal::ReserveRestricted)
    );
    submit_at(&mut c, 11 * ONE, 4_500, 5_000);
    assert_eq!(status(&c).state, ReserveState::Ok);
    assert!(c.check_reserves("tgold-a", "tgold-b").is_ok());
}

#[test]
fn the_breach_refuses_the_route_in_both_directions() {
    let mut c = approved_parity();
    add_custody(&mut c, ReserveAction::RestrictConversions);
    submit(&mut c, ONE);
    as_account(crate::registry_tests::registrar());
    assert_eq!(route_refusal(&c), None);
    c.supply_ledger.insert("tgold-a".into(), 2 * ONE);
    assert_eq!(route_refusal(&c), Some(RouteRefusal::ReserveRestricted));
    assert_eq!(
        c.get_route("tgold-b".into(), "tgold-a".into()).refusal,
        Some(RouteRefusal::ReserveRestricted)
    );
    let guards = c.get_route_guards("tgold-a".into(), "tgold-b".into(), None);
    let line = guards.checks.iter().find(|l| l.name == "reserves").unwrap();
    assert!(!line.passed && line.detail.contains("Breached"));
}

#[test]
fn stale_reserves_refuse_the_route_until_refreshed() {
    let mut c = approved_parity();
    add_custody(&mut c, ReserveAction::RestrictConversions);
    submit_at(&mut c, ONE, 4_000, 5_000);
    as_account_at(crate::registry_tests::registrar(), 4_000 + HOUR_MS + 1);
    assert_eq!(route_refusal(&c), Some(RouteRefusal::ReserveStale));
    submit_at(&mut c, ONE, 4_000 + HOUR_MS, 4_000 + HOUR_MS + 1);
    assert_eq!(route_refusal(&c), None);
}

#[test]
fn a_suspended_custodian_contributes_nothing() {
    let mut c = custody_core(ReserveAction::PauseMint);
    submit(&mut c, 10 * ONE);
    as_account(crate::registry_tests::registrar());
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Suspended);
    let s = status(&c);
    assert_eq!(s.state, ReserveState::NoAttestation);
    assert_eq!(s.attested_units, U128(0));
    assert!(s.mint_paused);
}

#[test]
fn tolerance_widens_the_limit_but_not_the_headroom() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(crate::tests::owner());
    let mut p = policy(ReserveAction::Warn);
    p.tolerance_bps = 100;
    c.set_reserve_policy("tgold-a".into(), p);
    submit(&mut c, 100 * ONE);
    c.supply_ledger.insert("tgold-a".into(), 101 * ONE);
    let s = status(&c);
    assert_eq!(s.limit_units, U128(101 * ONE));
    assert_eq!(s.state, ReserveState::Ok);
    assert_eq!(s.headroom_units, U128(0));
}

#[test]
fn a_supply_read_raises_circulating_but_never_lowers_the_ledger() {
    let mut c = custody_core(ReserveAction::Warn);
    submit(&mut c, 10 * ONE);
    c.supply_ledger.insert("tgold-a".into(), 3 * ONE);
    crate::tests::as_callback(near_sdk::PromiseResult::Successful(vec![]));
    assert!(c.on_supply_read("tgold-a".into(), Ok(U128(12 * ONE))));
    let supply = c.get_supply("tgold-a".into());
    assert_eq!(supply.circulating, U128(12 * ONE));
    assert_eq!(supply.read.unwrap().units, U128(12 * ONE));
    assert_eq!(status(&c).state, ReserveState::Breached);
    assert!(c.on_supply_read("tgold-a".into(), Ok(U128(ONE))));
    assert_eq!(
        c.get_supply("tgold-a".into()).circulating,
        U128(3 * ONE),
        "the ledger still counts what the gate minted"
    );
    assert!(!c.on_supply_read("tgold-a".into(), Err(near_sdk::PromiseError::Failed)));
}
