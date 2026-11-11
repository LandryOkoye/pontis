use crate::custody_fixture::*;
use crate::redemption_fixture::*;
use crate::registry_tests::{pauser, token_a};
use crate::tests::{as_account, as_account_at, as_callback, bob, last_event};
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::{PromiseError, PromiseResult};

const EVIDENCE: &str = "cd";

fn evidence() -> String {
    EVIDENCE.repeat(32)
}

fn accept(c: &mut Contract, id: u64) {
    as_account(back_office());
    c.accept_redemption(id);
}

fn burn_resolved(c: &mut Contract, id: u64, ok: bool) {
    if ok {
        as_callback(PromiseResult::Successful(vec![]));
        c.on_burn_resolved(id, Ok(()));
    } else {
        as_callback(PromiseResult::Failed);
        c.on_burn_resolved(id, Err(PromiseError::Failed));
    }
}

fn status(c: &Contract, id: u64) -> RedemptionStatus {
    c.get_redemption(id).unwrap().status
}

#[test]
fn accepting_sets_the_fulfil_deadline_and_counts() {
    let mut c = redemption_core();
    let id = request(&mut c, 5 * ONE);
    as_account_at(back_office(), 9_000);
    c.accept_redemption(id);
    let r = c.get_redemption(id).unwrap();
    assert_eq!(r.status, RedemptionStatus::Accepted);
    assert_eq!(r.accepted_ms, Some(9_000));
    assert_eq!(r.fulfil_deadline_ms, Some(9_000 + 2 * DAY_MS));
    let rel = c.get_issuer_reliability("iss".into());
    assert_eq!(
        (rel.accepted, rel.accept_latency_ms_total),
        (1, U128(4_000))
    );
    assert_eq!(last_event()["event"], "redemption_accepted");
}

#[test]
#[should_panic(expected = "caller is not an account of the representation's issuer")]
fn only_the_issuer_accepts() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account(bob());
    c.accept_redemption(id);
}

#[test]
#[should_panic(expected = "the accept deadline has passed")]
fn accepting_after_the_deadline_is_refused() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account_at(back_office(), 5_000 + 60_001);
    c.accept_redemption(id);
}

#[test]
fn fulfilling_burns_the_escrow_and_lowers_supply() {
    let mut c = redemption_core();
    c.supply_ledger.insert("tgold-a".into(), 10 * ONE);
    let id = request(&mut c, 4 * ONE);
    accept(&mut c, id);
    as_account(back_office());
    let _ = c.fulfil_redemption(id, evidence());
    let burn = calls()
        .into_iter()
        .find(|(_, m, _)| m == "minter_burn")
        .unwrap();
    assert_eq!(burn.0, token_a().to_string());
    assert_eq!(burn.2["amount"], (4 * ONE).to_string());
    assert_eq!(status(&c, id), RedemptionStatus::Fulfilled);
    assert!(c.get_redemption(id).unwrap().settling);
    assert_eq!(
        c.get_escrow_ledger("tgold-a".into()).burned,
        U128(0),
        "not burned until confirmed"
    );
    assert_conserved(&c);

    burn_resolved(&mut c, id, true);
    let r = c.get_redemption(id).unwrap();
    assert!(!r.settling);
    assert_eq!(r.fulfilment_evidence_hash, Some(evidence()));
    let ledger = c.get_escrow_ledger("tgold-a".into());
    assert_eq!((ledger.burned, ledger.held), (U128(4 * ONE), U128(0)));
    assert_conserved(&c);
    assert_eq!(c.get_supply("tgold-a".into()).ledger, U128(6 * ONE));
    let rel = c.get_issuer_reliability("iss".into());
    assert_eq!((rel.fulfilled, rel.settle_latency_ms_total), (1, U128(0)));
    assert_eq!(last_event()["event"], "redemption_fulfilled");
}

#[test]
fn a_failed_burn_returns_the_request_to_accepted() {
    let mut c = redemption_core();
    let id = request(&mut c, 4 * ONE);
    accept(&mut c, id);
    as_account(back_office());
    let _ = c.fulfil_redemption(id, evidence());
    burn_resolved(&mut c, id, false);
    let r = c.get_redemption(id).unwrap();
    assert_eq!(r.status, RedemptionStatus::Accepted);
    assert!(!r.settling && r.fulfilment_evidence_hash.is_none());
    assert_eq!(c.get_escrow_ledger("tgold-a".into()).burned, U128(0));
    assert_eq!(c.get_issuer_reliability("iss".into()).fulfilled, 0);
    assert_eq!(last_event()["event"], "redemption_fulfil_failed");
    assert_conserved(&c);
}

#[test]
#[should_panic(expected = "request is not accepted")]
fn a_request_cannot_be_fulfilled_twice() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    accept(&mut c, id);
    as_account(back_office());
    let _ = c.fulfil_redemption(id, evidence());
    let _ = c.fulfil_redemption(id, evidence());
}

#[test]
#[should_panic(expected = "request is not accepted")]
fn a_request_must_be_accepted_before_it_is_fulfilled() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account(back_office());
    let _ = c.fulfil_redemption(id, evidence());
}

#[test]
#[should_panic(expected = "evidence_hash must be 64 lowercase hex characters")]
fn the_evidence_hash_is_validated() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    accept(&mut c, id);
    let _ = c.fulfil_redemption(id, "not-a-hash".into());
}

#[test]
#[should_panic(expected = "the fulfil deadline has passed")]
fn fulfilling_after_the_deadline_is_refused() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    accept(&mut c, id);
    as_account_at(back_office(), 5_000 + 2 * DAY_MS + 1);
    let _ = c.fulfil_redemption(id, evidence());
}

#[test]
#[should_panic(expected = "request is not settling")]
fn the_burn_callback_settles_once() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    accept(&mut c, id);
    as_account(back_office());
    let _ = c.fulfil_redemption(id, evidence());
    burn_resolved(&mut c, id, true);
    burn_resolved(&mut c, id, true);
}

#[test]
fn rejecting_keeps_the_escrow_until_the_user_reclaims_it() {
    let mut c = redemption_core();
    let id = request(&mut c, 3 * ONE);
    as_account(back_office());
    c.reject_redemption(id, "KYC_FAILED".into());
    let r = c.get_redemption(id).unwrap();
    assert_eq!(
        (r.status, r.reject_reason.as_deref()),
        (RedemptionStatus::Rejected, Some("KYC_FAILED"))
    );
    assert!(r.miss.is_none());
    let rel = c.get_issuer_reliability("iss".into());
    assert_eq!((rel.rejected, rel.accept_misses), (1, 0));
    assert_conserved(&c);
    assert_eq!(c.get_escrow_ledger("tgold-a".into()).held, U128(3 * ONE));
}

#[test]
fn an_issuer_can_reject_while_the_contract_is_paused() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account(pauser());
    c.pause();
    as_account(back_office());
    c.reject_redemption(id, "PAUSED".into());
    assert_eq!(status(&c, id), RedemptionStatus::Rejected);
}

#[test]
#[should_panic(expected = "the deadline has passed; the request can only expire")]
fn a_late_issuer_cannot_reject_its_way_out_of_a_miss() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account_at(back_office(), 5_000 + 60_001);
    c.reject_redemption(id, "LATE".into());
}
