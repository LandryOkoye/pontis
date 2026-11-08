use crate::compat_lifecycle_tests::approved_parity;
use crate::quote_tests::{sign, signed_vector};
use crate::registry_tests::{registrar, token_a, token_b};
use crate::tests::{account, alice, as_account, as_account_at, owner};
use crate::vault::FUND_VAULT_MSG;
use crate::vault_tests::transfer_in;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::{serde_json, AccountId};

const SIGNER: &str = "ed25519:9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj";

/// Parity A to B approved at version 2, signer set, alice allowlisted on both, vault B funded.
pub(crate) fn ready() -> Contract {
    let mut c = approved_parity();
    as_account(owner());
    c.set_quote_signer(SIGNER.parse().unwrap());
    as_account(registrar());
    for rep in ["tgold-a", "tgold-b"] {
        c.set_allowlist(rep.into(), vec![alice()], true);
    }
    transfer_in(
        &mut c,
        token_b(),
        owner(),
        1_000_000_000_000,
        FUND_VAULT_MSG,
    );
    c
}

/// A signed quote derived from the shared vector (1 A to B for alice, expiring far ahead).
pub(crate) fn quote_msg(change: impl FnOnce(&mut QuoteInput)) -> String {
    let mut q = signed_vector().quote;
    change(&mut q);
    serde_json::to_string(&sign(q)).unwrap()
}

pub(crate) fn run(
    c: &Contract,
    token: AccountId,
    sender: AccountId,
    amount: u128,
    msg: &str,
) -> Result<ConversionPlan, Rejection> {
    as_account(token.clone());
    c.validate_conversion(&token, &sender, U128(amount), msg)
}

pub(crate) fn refused(c: &Contract, msg: &str) -> RejectReason {
    run(c, token_a(), alice(), 1_000_000, msg)
        .unwrap_err()
        .reason
}

#[test]
fn a_matching_quote_is_accepted_with_the_contract_computed_amounts() {
    let c = ready();
    let plan = run(&c, token_a(), alice(), 1_000_000, &quote_msg(|_| {})).unwrap();
    assert_eq!(
        (plan.from_id.as_str(), plan.to_id.as_str()),
        ("tgold-a", "tgold-b")
    );
    assert_eq!(
        (plan.amounts.gross, plan.amounts.fee, plan.amounts.net),
        (1_000_000_000, 1_000_000, 999_000_000)
    );
    assert_eq!(
        (plan.terms.compatibility_version, plan.terms.policy_version),
        (2, 1)
    );
}

#[test]
fn unreadable_or_unsigned_input_is_rejected() {
    let c = ready();
    assert_eq!(refused(&c, "not json"), RejectReason::InvalidMsg);
    let mut tampered = signed_vector();
    tampered.quote.amount_out = U128(2_000_000_000);
    let msg = serde_json::to_string(&tampered).unwrap();
    assert_eq!(
        run(&c, token_a(), alice(), 1_000_000, &msg)
            .unwrap_err()
            .reason,
        RejectReason::BadSignature
    );
}

#[test]
fn rejections_after_the_signature_carry_the_nonce() {
    let c = ready();
    let r = run(&c, token_a(), alice(), 5, &quote_msg(|_| {})).unwrap_err();
    assert_eq!(r.reason, RejectReason::AmountMismatch);
    assert_eq!(r.nonce.as_deref(), Some("000102030405060708090a0b0c0d0e0f"));
}

#[test]
fn an_expired_quote_is_rejected_and_the_expiry_instant_is_expired() {
    let c = ready();
    let msg = quote_msg(|q| q.expires_at_ms = 10_000);
    as_account_at(token_a(), 9_999);
    assert!(c
        .validate_conversion(&token_a(), &alice(), U128(1_000_000), &msg)
        .is_ok());
    as_account_at(token_a(), 10_000);
    let r = c.validate_conversion(&token_a(), &alice(), U128(1_000_000), &msg);
    assert_eq!(r.unwrap_err().reason, RejectReason::QuoteExpired);
}

#[test]
fn the_quote_is_bound_to_user_token_amount_contract_and_version() {
    let c = ready();
    let ok = quote_msg(|_| {});
    let reason = |sender: AccountId, token: AccountId, amount: u128, msg: &str| {
        run(&c, token, sender, amount, msg).unwrap_err().reason
    };
    assert_eq!(
        reason(account("mallory.testnet"), token_a(), 1_000_000, &ok),
        RejectReason::WrongSender
    );
    assert_eq!(
        reason(alice(), token_b(), 1_000_000, &ok),
        RejectReason::WrongToken
    );
    assert_eq!(
        reason(alice(), token_a(), 999_999, &ok),
        RejectReason::AmountMismatch
    );
    let other = quote_msg(|q| q.contract = "other.testnet".parse().unwrap());
    assert_eq!(refused(&c, &other), RejectReason::ContractMismatch);
    assert_eq!(
        refused(&c, &quote_msg(|q| q.version = 2)),
        RejectReason::UnsupportedVersion
    );
    let unknown = quote_msg(|q| q.token_out = "fake.testnet".parse().unwrap());
    assert_eq!(refused(&c, &unknown), RejectReason::UnknownToken);
}
