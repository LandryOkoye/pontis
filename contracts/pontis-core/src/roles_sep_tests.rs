//! Separation rules of ADR 0019: `registrar` and the attester roles are never held together and
//! the owner holds no attester role.

use crate::tests::{alice, new_core, owner};
use crate::*;

#[test]
#[should_panic(expected = "a registrar cannot hold an attester role")]
fn registrar_cannot_be_granted_an_attester_role() {
    let mut c = new_core();
    c.grant_role(RoleName::Registrar, alice());
    c.grant_role(RoleName::ReserveAttester, alice());
}

#[test]
#[should_panic(expected = "an attester cannot hold the registrar role")]
fn attester_cannot_be_granted_registrar() {
    let mut c = new_core();
    c.grant_role(RoleName::BridgeAttester, alice());
    c.grant_role(RoleName::Registrar, alice());
}

#[test]
fn registrar_returns_after_the_attester_role_is_revoked() {
    let mut c = new_core();
    c.grant_role(RoleName::Attester, alice());
    c.revoke_role(RoleName::Attester, alice());
    c.grant_role(RoleName::Registrar, alice());
    assert!(c.has_role(RoleName::Registrar, alice()));
}

#[test]
#[should_panic(expected = "the owner cannot hold an attester role")]
fn owner_cannot_be_an_attester() {
    let mut c = new_core();
    c.grant_role(RoleName::Attester, owner());
}

#[test]
#[should_panic(expected = "an attester cannot become the owner")]
fn an_attester_cannot_be_nominated_owner() {
    let mut c = new_core();
    c.grant_role(RoleName::Attester, alice());
    c.transfer_ownership(alice());
}
