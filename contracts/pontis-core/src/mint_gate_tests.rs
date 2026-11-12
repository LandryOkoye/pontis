use crate::custody_fixture::*;
use crate::registry_tests::token_a;
use crate::tests::{alice, as_account, as_callback, last_event};
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::{PromiseError, PromiseResult};

/// A core whose `tgold-a` has 10 units attested; the context is the back office.
fn funded(action: ReserveAction) -> Contract {
    let mut c = custody_core(action);
    submit(&mut c, 10 * ONE);
    as_account(back_office());
    c
}

fn request(c: &mut Contract, amount: u128) -> u64 {
    as_account(back_office());
    c.request_mint("tgold-a".into(), alice(), U128(amount), "sub-1".into())
}

fn resolve(c: &mut Contract, id: u64, ok: bool) {
    if ok {
        as_callback(PromiseResult::Successful(vec![]));
        c.on_mint_resolved(id, Ok(()));
    } else {
        as_callback(PromiseResult::Failed);
        c.on_mint_resolved(id, Err(PromiseError::Failed));
    }
}

#[test]
fn a_request_is_recorded_and_nothing_is_minted() {
    let mut c = funded(ReserveAction::Warn);
    let id = request(&mut c, 4 * ONE);
    assert_eq!(id, 1);
    let r = c.get_mint_request(1).unwrap();
    assert_eq!(r.status, MintStatus::Requested);
    assert_eq!((r.recipient, r.amount), (alice(), U128(4 * ONE)));
    assert_eq!(r.requested_by, back_office());
    assert_eq!(last_event()["event"], "mint_requested");
    assert_eq!(c.get_supply("tgold-a".into()).circulating, U128(0));
    assert!(calls().is_empty());
}

#[test]
#[should_panic(expected = "caller is not an account of the representation's issuer")]
fn only_an_issuer_account_requests() {
    let mut c = funded(ReserveAction::Warn);
    as_account(alice());
    c.request_mint("tgold-a".into(), alice(), U128(ONE), String::new());
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn a_zero_request_is_refused() {
    let mut c = funded(ReserveAction::Warn);
    request(&mut c, 0);
}

#[test]
fn a_mint_within_headroom_reserves_then_settles() {
    let mut c = funded(ReserveAction::Warn);
    let id = request(&mut c, 4 * ONE);
    as_account(back_office());
    let _ = c.execute_mint(id);
    let mint = calls()
        .into_iter()
        .find(|(_, m, _)| m == "minter_mint")
        .unwrap();
    assert_eq!(mint.0, token_a().to_string());
    assert_eq!(mint.2["account_id"], "alice.testnet");
    assert_eq!(mint.2["amount"], (4 * ONE).to_string());
    assert_eq!(c.get_mint_request(id).unwrap().status, MintStatus::Minting);
    let supply = c.get_supply("tgold-a".into());
    assert_eq!((supply.pending, supply.ledger), (U128(4 * ONE), U128(0)));
    assert_eq!(
        c.get_mint_headroom("tgold-a".into()).headroom_units,
        U128(6 * ONE)
    );

    resolve(&mut c, id, true);
    let supply = c.get_supply("tgold-a".into());
    assert_eq!((supply.pending, supply.ledger), (U128(0), U128(4 * ONE)));
    assert_eq!(c.get_mint_request(id).unwrap().status, MintStatus::Minted);
    assert_eq!(
        c.get_mint_headroom("tgold-a".into()).headroom_units,
        U128(6 * ONE)
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs.iter().any(|l| l.contains("\"mint_completed\"")));
}

#[test]
fn a_failed_token_mint_releases_the_reservation() {
    let mut c = funded(ReserveAction::Warn);
    let id = request(&mut c, 4 * ONE);
    as_account(back_office());
    let _ = c.execute_mint(id);
    resolve(&mut c, id, false);
    let supply = c.get_supply("tgold-a".into());
    assert_eq!((supply.pending, supply.ledger), (U128(0), U128(0)));
    let r = c.get_mint_request(id).unwrap();
    assert_eq!(r.status, MintStatus::Failed);
    assert!(r.failure.is_some());
    assert_eq!(
        c.get_mint_headroom("tgold-a".into()).headroom_units,
        U128(10 * ONE)
    );
}

#[test]
#[should_panic(expected = "exceeds reserve headroom")]
fn a_mint_above_headroom_is_refused() {
    let mut c = funded(ReserveAction::Warn);
    let id = request(&mut c, 10 * ONE + 1);
    as_account(back_office());
    let _ = c.execute_mint(id);
}

#[test]
#[should_panic(expected = "exceeds reserve headroom")]
fn an_in_flight_mint_counts_against_headroom() {
    let mut c = funded(ReserveAction::Warn);
    let first = request(&mut c, 6 * ONE);
    let second = request(&mut c, 6 * ONE);
    as_account(back_office());
    let _ = c.execute_mint(first);
    let _ = c.execute_mint(second);
}

#[test]
fn supply_read_above_the_ledger_shrinks_headroom() {
    let mut c = funded(ReserveAction::Warn);
    as_callback(PromiseResult::Successful(vec![]));
    c.on_supply_read("tgold-a".into(), Ok(U128(9 * ONE)));
    assert_eq!(
        c.get_mint_headroom("tgold-a".into()).headroom_units,
        U128(ONE)
    );
}

#[test]
#[should_panic(expected = "no reserve policy for this representation")]
fn an_unmonitored_representation_cannot_be_minted_through_the_gate() {
    let mut c = funded(ReserveAction::Warn);
    as_account(back_office());
    let id = c.request_mint("tgold-b".into(), alice(), U128(ONE), String::new());
    let _ = c.execute_mint(id);
}

#[test]
#[should_panic(expected = "mint is paused by the reserve action")]
fn pause_mint_refuses_while_the_reserves_are_stale() {
    let mut c = funded(ReserveAction::PauseMint);
    let id = request(&mut c, ONE);
    crate::tests::as_account_at(back_office(), 4_000 + HOUR_MS + 1);
    let _ = c.execute_mint(id);
}

#[test]
fn restrict_conversions_still_mints_within_headroom_when_stale() {
    let mut c = funded(ReserveAction::RestrictConversions);
    let id = request(&mut c, ONE);
    crate::tests::as_account_at(back_office(), 4_000 + HOUR_MS + 1);
    let _ = c.execute_mint(id);
    assert_eq!(c.get_mint_request(id).unwrap().status, MintStatus::Minting);
}

#[test]
#[should_panic(expected = "request is not open")]
fn a_request_executes_once() {
    let mut c = funded(ReserveAction::Warn);
    let id = request(&mut c, ONE);
    as_account(back_office());
    let _ = c.execute_mint(id);
    let _ = c.execute_mint(id);
}

#[test]
#[should_panic(expected = "request is not minting")]
fn the_callback_settles_once() {
    let mut c = funded(ReserveAction::Warn);
    let id = request(&mut c, ONE);
    as_account(back_office());
    let _ = c.execute_mint(id);
    resolve(&mut c, id, true);
    resolve(&mut c, id, true);
}

#[test]
fn a_cancelled_request_cannot_be_executed() {
    let mut c = funded(ReserveAction::Warn);
    let id = request(&mut c, ONE);
    as_account(back_office());
    c.cancel_mint_request(id);
    assert_eq!(
        c.get_mint_request(id).unwrap().status,
        MintStatus::Cancelled
    );
    assert_eq!(last_event()["event"], "mint_cancelled");
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.execute_mint(id);
    }));
    assert!(result.is_err());
}

#[test]
fn requests_are_paged_per_representation() {
    let mut c = funded(ReserveAction::Warn);
    for _ in 0..3 {
        request(&mut c, ONE);
    }
    let page = c.get_mint_requests("tgold-a".into(), 1, 5);
    assert_eq!(page.total, 3);
    assert_eq!(
        page.items.iter().map(|r| r.id).collect::<Vec<_>>(),
        vec![2, 3]
    );
    assert_eq!(c.get_mint_requests("tgold-b".into(), 0, 0).total, 0);
}

#[test]
fn refresh_supply_reads_the_token_then_calls_back() {
    let mut c = funded(ReserveAction::Warn);
    as_account(alice());
    let _ = c.refresh_supply("tgold-a".into());
    let calls = calls();
    assert_eq!(calls[0].0, token_a().to_string());
    assert_eq!(calls[0].1, "ft_total_supply");
    assert_eq!(calls[1].1, "on_supply_read");
    assert_eq!(calls[1].2["representation_id"], "tgold-a");
}
