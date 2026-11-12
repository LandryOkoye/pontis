use crate::signers::SignerError;
use crate::signers_tests::{core_with_key, key_from, public};
use crate::tests::{alice, bob};
use crate::*;
use ed25519_dalek::Signer;

#[test]
fn verify_signer_checks_key_scope_and_signature() {
    let c = core_with_key();
    let sk = key_from(7);
    let key = public(&sk);
    let message = b"hello reserves";
    let sig = sk.sign(message).to_bytes();
    let role = RoleName::ReserveAttester;
    assert_eq!(
        c.verify_signer(role, &key, "reserves", message, &sig),
        Ok(alice())
    );
    assert_eq!(
        c.verify_signer(role, &key, "custody", message, &sig),
        Err(SignerError::ScopeMissing)
    );
    assert_eq!(
        c.verify_signer(role, &key, "reserves", b"other", &sig),
        Err(SignerError::BadSignature)
    );
    assert_eq!(
        c.verify_signer(role, &public(&key_from(8)), "reserves", message, &sig),
        Err(SignerError::UnknownKey)
    );
    assert_eq!(
        c.verify_signer(RoleName::Attester, &key, "reserves", message, &sig),
        Err(SignerError::UnknownKey)
    );
}

#[test]
fn revoking_the_role_drops_that_accounts_keys_only() {
    let mut c = core_with_key();
    c.grant_role(RoleName::ReserveAttester, bob());
    c.add_signer_key(
        RoleName::ReserveAttester,
        bob(),
        public(&key_from(9)),
        vec!["custody".to_string()],
    );
    c.revoke_role(RoleName::ReserveAttester, alice());
    let keys = c.get_signer_keys(RoleName::ReserveAttester);
    assert_eq!(keys.len(), 1);
    assert_eq!(keys[0].account_id, bob());
    let sk = key_from(7);
    let sig = sk.sign(b"m").to_bytes();
    assert_eq!(
        c.verify_signer(
            RoleName::ReserveAttester,
            &public(&sk),
            "reserves",
            b"m",
            &sig
        ),
        Err(SignerError::UnknownKey)
    );
}
