use crate::custody_fixture::*;
use crate::redemption_fixture::*;
use crate::registry_tests::{pauser, token_a};
use crate::tests::{alice, as_account, as_account_at, as_callback, bob, last_event};
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

fn burn_resolved(c: &mut Contract, id: u64) {
    as_callback(PromiseResult::Successful(vec![]));
    c.on_burn_resolved(id, Ok(()));
}

fn reclaim_resolved(c: &mut Contract, id: u64, ok: bool) {
    if ok {
        as_callback(PromiseResult::Successful(vec![]));
        c.on_reclaim_resolved(id, Ok(()));
    } else {
        as_callback(PromiseResult::Failed);
        c.on_reclaim_resolved(id, Err(PromiseError::Failed));
    }
}

fn status(c: &Contract, id: u64) -> RedemptionStatus {
    c.get_redemption(id).unwrap().status
}

#[test]
fn an_unaccepted_request_expires_and_the_miss_counts() {
    let mut c = redemption_core();
    let id = request(&mut c, 2 * ONE);
    as_account_at(bob(), 5_000 + 60_001);
    c.expire_redemption(id);
    let r = c.get_redemption(id).unwrap();
    assert_eq!(
        (r.status, r.miss),
        (RedemptionStatus::Expired, Some(Miss::Accept))
    );
    let rel = c.get_issuer_reliability("iss".into());
    assert_eq!(
        (rel.expired, rel.accept_misses, rel.fulfil_misses),
        (1, 1, 0)
    );
    assert_eq!(rel.last_miss_ms, Some(65_001));
    assert_eq!(last_event()["event"], "redemption_expired");
    assert_conserved(&c);
}

#[test]
fn an_accepted_request_expires_with_a_fulfil_miss() {
    let mut c = redemption_core();
    let id = request(&mut c, 2 * ONE);
    accept(&mut c, id);
    as_account_at(bob(), 5_000 + 2 * DAY_MS + 1);
    c.expire_redemption(id);
    assert_eq!(c.get_redemption(id).unwrap().miss, Some(Miss::Fulfil));
    assert_eq!(c.get_issuer_reliability("iss".into()).fulfil_misses, 1);
}

#[test]
#[should_panic(expected = "nothing to expire")]
fn nothing_expires_before_its_deadline() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account(bob());
    c.expire_redemption(id);
}

#[test]
#[should_panic(expected = "nothing to expire")]
fn a_request_expires_once() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account_at(bob(), 5_000 + 60_001);
    c.expire_redemption(id);
    c.expire_redemption(id);
}

#[test]
fn reclaiming_an_expired_request_returns_the_escrow() {
    let mut c = redemption_core();
    let id = request(&mut c, 2 * ONE);
    as_account_at(bob(), 5_000 + 60_001);
    c.expire_redemption(id);
    as_account_at(alice(), 70_000);
    let _ = c.reclaim_redemption(id);
    let transfer = calls()
        .into_iter()
        .find(|(_, m, _)| m == "ft_transfer")
        .unwrap();
    assert_eq!(transfer.0, token_a().to_string());
    assert_eq!(transfer.2["receiver_id"], "alice.testnet");
    assert_eq!(transfer.2["amount"], (2 * ONE).to_string());
    assert_eq!(status(&c, id), RedemptionStatus::Reclaimed);
    assert_eq!(
        c.get_escrow_ledger("tgold-a".into()).returned,
        U128(0),
        "not returned until confirmed"
    );
    assert_conserved(&c);
    reclaim_resolved(&mut c, id, true);
    let ledger = c.get_escrow_ledger("tgold-a".into());
    assert_eq!((ledger.returned, ledger.held), (U128(2 * ONE), U128(0)));
    assert_conserved(&c);
    assert_eq!(c.get_issuer_reliability("iss".into()).reclaimed, 1);
    assert_eq!(last_event()["event"], "redemption_reclaimed");
}

#[test]
fn a_failed_return_restores_the_status_and_can_be_retried() {
    let mut c = redemption_core();
    let id = request(&mut c, 2 * ONE);
    as_account(back_office());
    c.reject_redemption(id, "NO".into());
    as_account(alice());
    let _ = c.reclaim_redemption(id);
    reclaim_resolved(&mut c, id, false);
    assert_eq!(status(&c, id), RedemptionStatus::Rejected);
    assert_eq!(last_event()["event"], "redemption_reclaim_failed");
    assert_conserved(&c);
    as_account(alice());
    let _ = c.reclaim_redemption(id);
    reclaim_resolved(&mut c, id, true);
    assert_eq!(status(&c, id), RedemptionStatus::Reclaimed);
    assert_conserved(&c);
}

#[test]
fn reclaiming_an_overdue_request_expires_it_first() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account_at(alice(), 5_000 + 60_001);
    let _ = c.reclaim_redemption(id);
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs.iter().any(|l| l.contains("\"redemption_expired\"")));
    assert_eq!(status(&c, id), RedemptionStatus::Reclaimed);
    assert_eq!(c.get_redemption(id).unwrap().miss, Some(Miss::Accept));
}

#[test]
#[should_panic(expected = "the escrow is not reclaimable yet")]
fn an_open_request_cannot_be_reclaimed_early() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account(alice());
    let _ = c.reclaim_redemption(id);
}

#[test]
#[should_panic(expected = "only the redemption's user can reclaim")]
fn only_the_user_reclaims() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account_at(bob(), 5_000 + 60_001);
    let _ = c.reclaim_redemption(id);
}

#[test]
#[should_panic(expected = "the escrow is not reclaimable yet")]
fn a_fulfilled_request_cannot_be_reclaimed() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    accept(&mut c, id);
    as_account(back_office());
    let _ = c.fulfil_redemption(id, evidence());
    burn_resolved(&mut c, id);
    as_account(alice());
    let _ = c.reclaim_redemption(id);
}

#[test]
fn a_reclaim_works_while_paused() {
    let mut c = redemption_core();
    let id = request(&mut c, ONE);
    as_account_at(back_office(), 5_001);
    c.reject_redemption(id, "NO".into());
    as_account(pauser());
    c.pause();
    as_account(alice());
    let _ = c.reclaim_redemption(id);
    assert_eq!(status(&c, id), RedemptionStatus::Reclaimed);
}

#[test]
fn conservation_holds_across_a_mixed_run() {
    let mut c = redemption_core();
    c.supply_ledger.insert("tgold-a".into(), 100 * ONE);
    let (a, b, d, e) = (
        request(&mut c, 3 * ONE),
        request(&mut c, 5 * ONE),
        request(&mut c, 7 * ONE),
        request(&mut c, 11 * ONE),
    );
    assert_conserved(&c);
    accept(&mut c, a);
    accept(&mut c, b);
    as_account(back_office());
    c.reject_redemption(d, "NO".into());
    let _ = c.fulfil_redemption(a, evidence());
    assert_conserved(&c);
    burn_resolved(&mut c, a);
    assert_conserved(&c);
    as_account_at(bob(), 5_000 + 60_001);
    c.expire_redemption(e);
    for id in [d, e] {
        as_account_at(alice(), 70_000);
        let _ = c.reclaim_redemption(id);
        reclaim_resolved(&mut c, id, true);
        assert_conserved(&c);
    }
    let l = c.get_escrow_ledger("tgold-a".into());
    assert_eq!(
        (l.escrowed_in, l.burned, l.returned, l.held),
        (U128(26 * ONE), U128(3 * ONE), U128(18 * ONE), U128(5 * ONE))
    );
    let rel = c.get_issuer_reliability("iss".into());
    assert_eq!(
        (
            rel.requested,
            rel.accepted,
            rel.fulfilled,
            rel.rejected,
            rel.expired,
            rel.reclaimed
        ),
        (4, 2, 1, 1, 1, 2)
    );
}
