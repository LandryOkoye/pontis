use crate::custody_fixture::*;
use crate::redemption_fixture::*;
use crate::registry_tests::{pauser, registrar};
use crate::tests::{alice, as_account, as_account_at, bob, last_event};
use crate::*;
use near_sdk::json_types::U128;

fn refusal_of(c: &mut Contract, amount: u128, msg: &str) -> (u128, String) {
    let returned = redeem(c, &alice(), amount, msg);
    let e = last_event();
    assert_eq!(e["event"], "redemption_refused");
    (returned, e["data"]["reason"].as_str().unwrap().to_string())
}

#[test]
fn a_redemption_escrows_the_whole_amount_with_a_snapshot_of_the_terms() {
    let mut c = redemption_core();
    let id = request(&mut c, 5 * ONE);
    assert_eq!(id, 1);
    let r = c.get_redemption(id).unwrap();
    assert_eq!(r.status, RedemptionStatus::Requested);
    assert_eq!((r.user.clone(), r.amount), (alice(), U128(5 * ONE)));
    assert_eq!(r.issuer_id, "iss");
    assert_eq!(
        (r.fee_bps, r.fee_units, r.net_units),
        (25, U128(12_500), U128(4_987_500))
    );
    assert_eq!(r.terms_version, 1);
    assert_eq!(r.payout_instruction_hash, payout_hash());
    assert_eq!(r.accept_deadline_ms, 5_000 + 60_000);
    assert_eq!(r.settlement_days, 2);
    assert!(!r.settling && r.accepted_ms.is_none() && r.miss.is_none());
    let ledger = c.get_escrow_ledger("tgold-a".into());
    assert_eq!(
        (ledger.escrowed_in, ledger.held),
        (U128(5 * ONE), U128(5 * ONE))
    );
    assert_conserved(&c);
    assert_eq!(c.get_issuer_reliability("iss".into()).requested, 1);
    assert_eq!(c.get_redemptions_by_user(alice(), 0, 0).total, 1);
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs.iter().any(|l| l.contains("\"redemption_requested\"")));
}

#[test]
fn a_stale_terms_hash_is_refused_and_the_amount_returns() {
    let mut c = redemption_core();
    let old = msg_for(&c);
    as_account(registrar());
    c.set_redemption_terms("tgold-a".into(), terms());
    assert_eq!(c.get_redemption_terms("tgold-a".into()).unwrap().version, 2);
    let (returned, reason) = refusal_of(&mut c, 2 * ONE, &old);
    assert_eq!((returned, reason.as_str()), (2 * ONE, "TERMS_CHANGED"));
    assert!(c.get_redemption(1).is_none());
    assert_eq!(c.get_escrow_ledger("tgold-a".into()).escrowed_in, U128(0));
}

#[test]
fn malformed_messages_are_refused_invalid() {
    let mut c = redemption_core();
    let hash = c.get_redemption_terms("tgold-a".into()).unwrap().terms_hash;
    for msg in [
        format!("redeem:{hash}"),
        format!("redeem:{}:{}", hash.to_uppercase(), payout_hash()),
        format!("redeem:{hash}:{}:x", payout_hash()),
        format!("redeem:{}:{}", &hash[..62], payout_hash()),
    ] {
        assert_eq!(
            refusal_of(&mut c, ONE, &msg),
            (ONE, "INVALID_MSG".to_string()),
            "{msg}"
        );
    }
}

#[test]
fn amount_limits_are_enforced() {
    let mut c = redemption_core();
    let msg = msg_for(&c);
    assert_eq!(refusal_of(&mut c, ONE - 1, &msg).1, "BELOW_MIN");
    as_account(registrar());
    let mut t = terms();
    t.max_amount = U128(10 * ONE);
    c.set_redemption_terms("tgold-a".into(), t);
    let msg = msg_for(&c);
    assert_eq!(refusal_of(&mut c, 10 * ONE + 1, &msg).1, "ABOVE_MAX");
    assert_eq!(redeem(&mut c, &alice(), 10 * ONE, &msg), 0);
}

#[test]
fn the_window_must_be_open() {
    let mut c = redemption_core();
    as_account(registrar());
    let mut t = terms();
    t.window_anchor_ms = 1_000_000;
    t.window_length_ms = 10_000;
    t.window_period_ms = 100_000;
    c.set_redemption_terms("tgold-a".into(), t);
    let msg = msg_for(&c);
    assert_eq!(refusal_of(&mut c, ONE, &msg).1, "WINDOW_CLOSED");
    as_account_at(token_a_account(), 1_005_000);
    assert_eq!(
        crate::vault_tests::unused(c.ft_on_transfer(alice(), U128(ONE), msg)),
        0,
        "inside the first window"
    );
}

fn token_a_account() -> near_sdk::AccountId {
    crate::registry_tests::token_a()
}

#[test]
fn missing_terms_and_unredeemable_assets_are_refused() {
    let mut c = redemption_core();
    as_account(token_b_account());
    let hash = c.get_redemption_terms("tgold-a".into()).unwrap().terms_hash;
    let msg = format!("redeem:{hash}:{}", payout_hash());
    let returned = crate::vault_tests::unused(c.ft_on_transfer(alice(), U128(ONE), msg.clone()));
    assert_eq!(returned, ONE);
    assert_eq!(last_event()["data"]["reason"], "TERMS_MISSING");

    as_account(registrar());
    c.set_representation_status("tgold-a".into(), Status::Deprecated);
    assert_eq!(refusal_of(&mut c, ONE, &msg).1, "ASSET_NOT_REDEEMABLE");
}

fn token_b_account() -> near_sdk::AccountId {
    crate::registry_tests::token_b()
}

#[test]
fn a_restricted_representation_can_still_be_redeemed() {
    let mut c = redemption_core();
    as_account(registrar());
    c.set_representation_status("tgold-a".into(), Status::Restricted);
    let id = request(&mut c, ONE);
    assert_eq!(
        c.get_redemption(id).unwrap().status,
        RedemptionStatus::Requested
    );
}

#[test]
fn an_unknown_token_is_refused_and_a_pause_blocks_requests() {
    let mut c = redemption_core();
    let msg = msg_for(&c);
    as_account(crate::tests::account("stranger.testnet"));
    let returned = crate::vault_tests::unused(c.ft_on_transfer(alice(), U128(ONE), msg.clone()));
    assert_eq!(returned, ONE);
    assert_eq!(last_event()["data"]["reason"], "UNKNOWN_TOKEN");
    as_account(pauser());
    c.pause();
    assert_eq!(refusal_of(&mut c, ONE, &msg).1, "PAUSED");
}

#[test]
fn at_most_twenty_requests_are_open_per_user() {
    let mut c = redemption_core();
    for _ in 0..MAX_OPEN_PER_USER {
        request(&mut c, ONE);
    }
    let msg = msg_for(&c);
    assert_eq!(refusal_of(&mut c, ONE, &msg).1, "TOO_MANY_OPEN");
    assert_eq!(
        redeem(&mut c, &bob(), ONE, &msg),
        0,
        "another user is unaffected"
    );
    assert_conserved(&c);
}

#[test]
fn terms_are_validated() {
    let mut c = redemption_core();
    for (field, bad) in [
        (
            "min",
            RedemptionTerms {
                min_amount: U128(0),
                ..terms()
            },
        ),
        (
            "max below min",
            RedemptionTerms {
                max_amount: U128(ONE - 1),
                ..terms()
            },
        ),
        (
            "fee",
            RedemptionTerms {
                fee_bps: 1_001,
                ..terms()
            },
        ),
        (
            "accept",
            RedemptionTerms {
                accept_within_ms: 999,
                ..terms()
            },
        ),
        (
            "settlement",
            RedemptionTerms {
                settlement_days: 0,
                ..terms()
            },
        ),
        (
            "window",
            RedemptionTerms {
                window_period_ms: 10,
                window_length_ms: 11,
                ..terms()
            },
        ),
    ] {
        as_account(registrar());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.set_redemption_terms("tgold-a".into(), bad.clone());
        }));
        assert!(result.is_err(), "{field} must be refused");
    }
    assert_eq!(c.get_redemption_terms("tgold-a".into()).unwrap().version, 1);
}

#[test]
#[should_panic(expected = "caller is not a registrar")]
fn only_a_registrar_sets_terms() {
    let mut c = redemption_core();
    as_account(alice());
    c.set_redemption_terms("tgold-a".into(), terms());
}

#[test]
fn setting_terms_bumps_the_version_and_changes_the_hash() {
    let mut c = redemption_core();
    let first = c.get_redemption_terms("tgold-a".into()).unwrap();
    as_account(registrar());
    c.set_redemption_terms("tgold-a".into(), terms());
    let second = c.get_redemption_terms("tgold-a".into()).unwrap();
    assert_eq!((first.version, second.version), (1, 2));
    assert_ne!(first.terms_hash, second.terms_hash);
    assert_eq!(last_event()["event"], "redemption_terms_set");
}
