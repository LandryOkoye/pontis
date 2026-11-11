//! Test fixture for redemption: the custody fixture plus terms on `tgold-a` (minimum 1 token, fee
//! 25 bps, always open, 60 s to accept, 2 days to fulfil) and helpers to redeem and to check the
//! escrow-conservation invariant.

use crate::custody_fixture::*;
use crate::registry_tests::{registrar, token_a};
use crate::tests::as_account;
use crate::vault_tests::unused;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::{env, AccountId};

pub(crate) fn terms() -> RedemptionTerms {
    RedemptionTerms {
        min_amount: U128(ONE),
        max_amount: U128(0),
        fee_bps: 25,
        window_anchor_ms: 0,
        window_length_ms: 0,
        window_period_ms: 0,
        accept_within_ms: 60_000,
        settlement_days: 2,
    }
}

pub(crate) fn payout_hash() -> String {
    crate::hexa::encode(&env::sha256(b"payout instruction ciphertext"))
}

/// `tgold-a` has custody, a `warn` policy and the terms above; the context is the registrar.
pub(crate) fn redemption_core() -> Contract {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(registrar());
    c.set_redemption_terms("tgold-a".into(), terms());
    c
}

pub(crate) fn msg_for(c: &Contract) -> String {
    let hash = c.get_redemption_terms("tgold-a".into()).unwrap().terms_hash;
    format!("redeem:{hash}:{}", payout_hash())
}

/// `ft_transfer_call` of `amount` TGOLD-A from `user` with `msg`; returns the unused amount.
pub(crate) fn redeem(c: &mut Contract, user: &AccountId, amount: u128, msg: &str) -> u128 {
    as_account(token_a());
    unused(c.ft_on_transfer(user.clone(), U128(amount), msg.to_string()))
}

/// Redeems `amount` for alice with the current terms; returns the new id.
pub(crate) fn request(c: &mut Contract, amount: u128) -> u64 {
    let msg = msg_for(c);
    let before = c
        .get_redemptions_by_representation("tgold-a".into(), 0, 1)
        .total;
    assert_eq!(
        redeem(c, &crate::tests::alice(), amount, &msg),
        0,
        "escrowed in full"
    );
    let after = c
        .get_redemptions_by_representation("tgold-a".into(), 0, 1)
        .total;
    assert_eq!(after, before + 1);
    c.get_redemptions_by_representation("tgold-a".into(), before, 1)
        .items[0]
        .id
}

/// The escrow-conservation invariant: in = burned + returned + held, held = sum of open requests.
pub(crate) fn assert_conserved(c: &Contract) {
    let l = c.get_escrow_ledger("tgold-a".into());
    assert_eq!(
        l.escrowed_in.0,
        l.burned.0 + l.returned.0 + l.held.0,
        "in = burned + returned + held"
    );
    assert_eq!(l.held, l.open_amount, "held equals the open requests");
}
