use crate::conversion_tests::{quote_msg, ready, refused};
use crate::registry_tests::{pauser, registrar, token_b};
use crate::tests::{alice, as_account, owner};
use crate::*;
use near_sdk::json_types::U128;

#[test]
fn a_changed_policy_version_invalidates_the_quote() {
    let mut c = ready();
    let msg = quote_msg(|_| {});
    as_account(registrar());
    c.set_allowlist_required("tgold-a".into(), false);
    assert_eq!(refused(&c, &msg), RejectReason::PolicyChanged);
}

#[test]
fn a_changed_fee_invalidates_the_quote() {
    let mut c = ready();
    let msg = quote_msg(|_| {});
    as_account(owner());
    c.set_fee_bps(20);
    assert_eq!(refused(&c, &msg), RejectReason::FeeChanged);
}

#[test]
fn a_new_compatibility_version_invalidates_the_quote() {
    let mut c = ready();
    let msg = quote_msg(|_| {});
    as_account(pauser());
    c.suspend_compatibility("tgold-a".into(), "tgold-b".into(), "stale".into());
    as_account(crate::compat_tests::approver());
    c.approve_compatibility("tgold-a".into(), "tgold-b".into(), "again".into());
    assert_eq!(refused(&c, &msg), RejectReason::CompatibilityChanged);
}

#[test]
fn a_suspended_pair_blocks_execution() {
    let mut c = ready();
    as_account(pauser());
    c.suspend_compatibility("tgold-a".into(), "tgold-b".into(), "stale".into());
    assert_eq!(
        refused(&c, &quote_msg(|_| {})),
        RejectReason::RelationshipSuspended
    );
}

#[test]
fn a_paused_asset_blocks_execution() {
    let mut c = ready();
    as_account(pauser());
    c.pause_asset("tgold-b".into());
    assert_eq!(refused(&c, &quote_msg(|_| {})), RejectReason::AssetPaused);
}

#[test]
fn an_account_removed_from_the_allowlist_is_not_eligible() {
    let mut c = ready();
    as_account(registrar());
    c.set_allowlist("tgold-b".into(), vec![alice()], false);
    assert_eq!(refused(&c, &quote_msg(|_| {})), RejectReason::NotEligible);
}

#[test]
fn the_contract_recomputes_the_output_instead_of_trusting_the_quote() {
    let c = ready();
    // Correctly signed by the backend, but the amounts are better than the approved ratio allows.
    assert_eq!(
        refused(&c, &quote_msg(|q| q.amount_out = U128(1_000_000_000))),
        RejectReason::OutputMismatch
    );
    assert_eq!(
        refused(&c, &quote_msg(|q| q.fee = U128(0))),
        RejectReason::OutputMismatch
    );
}

#[test]
fn dust_that_converts_to_nothing_is_refused() {
    let c = ready();
    // 999 smallest B units convert to floor(0.999) = 0 A units.
    let dust = quote_msg(|q| {
        q.token_in = "tgold-b.testnet".parse().unwrap();
        q.token_out = "tgold-a.testnet".parse().unwrap();
        q.amount_in = U128(999);
        q.amount_out_gross = U128(0);
        q.fee = U128(0);
        q.amount_out = U128(0);
    });
    as_account(token_b());
    let r = c.validate_conversion(&token_b(), &alice(), U128(999), &dust);
    assert_eq!(r.unwrap_err().reason, RejectReason::AmountTooSmall);
}

#[test]
fn a_replayed_nonce_is_refused() {
    let mut c = ready();
    c.used_nonces
        .insert(*b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f");
    assert_eq!(refused(&c, &quote_msg(|_| {})), RejectReason::NonceUsed);
}

#[test]
fn insufficient_inventory_is_refused() {
    let mut c = ready();
    c.inventory.insert("tgold-b".to_string(), 998_999_999);
    assert_eq!(
        refused(&c, &quote_msg(|_| {})),
        RejectReason::InsufficientInventory
    );
}
