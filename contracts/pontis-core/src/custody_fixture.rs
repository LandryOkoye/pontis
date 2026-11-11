//! Test fixture for custody, reserves and the mint gate: the two-representation registry of the
//! other tests, an issuer whose back office is `issuer-bo.testnet`, a reserve attester with the
//! dev key of `test-vectors/reserve-attestation.json`, one custodian linked to `tgold-a` and a
//! reserve policy.

use crate::registry_tests::{attest, core, new_asset, new_issuer, new_rep, token_a, token_b};
use crate::tests::{account, as_account, as_account_at, owner};
use crate::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{AccountId, CurveType, PublicKey};

pub(crate) const ONE: u128 = 1_000_000;
pub(crate) const HOUR_MS: u64 = 3_600_000;

pub(crate) fn back_office() -> AccountId {
    account("issuer-bo.testnet")
}
pub(crate) fn custodian_account() -> AccountId {
    account("custodian.testnet")
}
pub(crate) fn relayer() -> AccountId {
    account("relayer.testnet")
}

/// The dev reserve attester key: seed bytes 201 to 232.
pub(crate) fn custodian_signing_key() -> SigningKey {
    SigningKey::from_bytes(&(201..=232u8).collect::<Vec<_>>().try_into().unwrap())
}

pub(crate) fn public_of(sk: &SigningKey) -> PublicKey {
    PublicKey::from_parts(CurveType::ED25519, sk.verifying_key().to_bytes().to_vec()).unwrap()
}

pub(crate) fn custodian_key() -> PublicKey {
    public_of(&custodian_signing_key())
}

pub(crate) fn new_custodian(id: &str, key: PublicKey) -> NewCustodian {
    NewCustodian {
        id: id.to_string(),
        name: "Meridian Vault Co (SYNTHETIC)".to_string(),
        jurisdiction: Some("CH".to_string()),
        attester_key: key,
        synthetic: true,
        verification_status: VerificationStatus::Unverified,
        evidence: vec![crate::registry_tests::evidence(Provenance::IssuerProvided)],
    }
}

pub(crate) fn policy(action: ReserveAction) -> ReservePolicy {
    ReservePolicy {
        tolerance_bps: 0,
        max_reserve_age_ms: HOUR_MS,
        action,
        baseline_supply: U128(0),
    }
}

/// Registers the issuer, asset and both representations as the registrar.
fn registry(c: &mut Contract) {
    let mut issuer = new_issuer("iss");
    issuer.controlled_accounts.push(back_office());
    c.register_issuer(issuer);
    attest(c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Active);
    c.register_canonical_asset(new_asset("gold"));
    attest(c, SubjectType::CanonicalAsset, "gold");
    c.set_canonical_asset_status("gold".into(), Status::Active);
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
    c.register_representation(new_rep("tgold-b", "iss", "gold", token_b()));
    for id in ["tgold-a", "tgold-b"] {
        attest(c, SubjectType::Representation, id);
        c.set_representation_status(id.into(), Status::Active);
    }
}

/// A custody setup on any core that has `tgold-a`: the attester role and dev key, custodian
/// `vault-co-sim` linked to `tgold-a`, and a policy of `action`. The context is left as the
/// registrar.
pub(crate) fn add_custody(c: &mut Contract, action: ReserveAction) {
    as_account(owner());
    c.grant_role(RoleName::ReserveAttester, custodian_account());
    c.add_signer_key(
        RoleName::ReserveAttester,
        custodian_account(),
        custodian_key(),
        vec!["reserves".to_string()],
    );
    as_account(crate::registry_tests::registrar());
    c.register_custodian(new_custodian("vault-co-sim", custodian_key()));
    c.link_custody(
        "tgold-a".into(),
        CustodyStructure::Segregated,
        vec!["vault-co-sim".into()],
    );
    as_account(owner());
    c.set_reserve_policy("tgold-a".into(), policy(action));
    as_account(crate::registry_tests::registrar());
}

/// `tgold-a` is monitored with a policy of `action`; `tgold-b` is unmonitored. The issuer's back
/// office is `issuer-bo.testnet`. The context is left as the registrar.
pub(crate) fn custody_core(action: ReserveAction) -> Contract {
    let mut c = core();
    registry(&mut c);
    add_custody(&mut c, action);
    c
}

pub(crate) fn attestation(rep: &str, units: u128, as_of_ms: u64) -> ReserveAttestation {
    ReserveAttestation {
        version: 1,
        contract: account("core.testnet"),
        representation_id: rep.to_string(),
        custodian_id: "vault-co-sim".to_string(),
        reserved_units: U128(units),
        as_of_ms,
        report_hash: "ab".repeat(32),
        report_uri: "sim://reserves/tgold-a/2026-11".to_string(),
        simulated: true,
        source: "simulated_custodian".to_string(),
    }
}

pub(crate) fn sign(a: &ReserveAttestation) -> Base64VecU8 {
    Base64VecU8(
        custodian_signing_key()
            .sign(&a.signing_message().unwrap())
            .to_bytes()
            .to_vec(),
    )
}

/// Submits a signed attestation as the relayer at block time `now_ms`.
pub(crate) fn submit_at(c: &mut Contract, units: u128, as_of_ms: u64, now_ms: u64) {
    let a = attestation("tgold-a", units, as_of_ms);
    let signature = sign(&a);
    as_account_at(relayer(), now_ms);
    c.submit_reserve_attestation(a, signature, custodian_key());
}

/// Submits at the default block time (5,000 ms) an attestation as of 4,000 ms.
pub(crate) fn submit(c: &mut Contract, units: u128) {
    submit_at(c, units, 4_000, 5_000);
}

/// (receiver, method, args) of every function call the contract scheduled.
pub(crate) fn calls() -> Vec<(String, String, near_sdk::serde_json::Value)> {
    use near_sdk::mock::MockAction;
    let mut out = vec![];
    for receipt in near_sdk::test_utils::get_created_receipts() {
        for action in receipt.actions {
            if let MockAction::FunctionCallWeight {
                method_name, args, ..
            } = action
            {
                let args = near_sdk::serde_json::from_slice(&args).unwrap_or_default();
                let method = String::from_utf8(method_name).unwrap();
                out.push((receipt.receiver_id.to_string(), method, args));
            }
        }
    }
    out
}
