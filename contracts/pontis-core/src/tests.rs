use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

pub(crate) fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}
pub(crate) fn owner() -> AccountId {
    account("owner.testnet")
}
pub(crate) fn alice() -> AccountId {
    account("alice.testnet")
}
pub(crate) fn bob() -> AccountId {
    account("bob.testnet")
}

/// Calls as `who` with exactly 1 yoctoNEAR (required by every state-changing method).
pub(crate) fn as_account(who: AccountId) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(account("core.testnet"))
        .predecessor_account_id(who)
        .attached_deposit(NearToken::from_yoctonear(1))
        .block_timestamp(5_000 * 1_000_000)
        .build());
}

fn without_deposit(who: AccountId) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(account("core.testnet"))
        .predecessor_account_id(who)
        .build());
}

pub(crate) fn new_core() -> Contract {
    as_account(owner());
    Contract::new(owner())
}

pub(crate) fn last_event() -> near_sdk::serde_json::Value {
    let line = get_logs().pop().expect("no log emitted");
    near_sdk::serde_json::from_str(line.strip_prefix("EVENT_JSON:").expect("not an event")).unwrap()
}

#[test]
fn starts_with_owner_only_and_no_roles() {
    let c = new_core();
    assert_eq!(c.get_owner(), owner());
    assert!(!c.is_paused());
    assert!(c.get_role_members(RoleName::Registrar).is_empty());
    assert!(
        !c.has_role(RoleName::Pauser, owner()),
        "owner is not implicitly a pauser"
    );
}

#[test]
fn owner_grants_and_revokes_roles_with_events() {
    let mut c = new_core();
    c.grant_role(RoleName::Registrar, alice());
    assert!(c.has_role(RoleName::Registrar, alice()));
    assert_eq!(c.get_role_members(RoleName::Registrar), vec![alice()]);
    let e = last_event();
    assert_eq!(e["standard"], "pontis");
    assert_eq!(e["version"], "1.0.0");
    assert_eq!(e["event"], "role_granted");
    assert_eq!(e["data"]["role"], "registrar");
    assert_eq!(e["data"]["account_id"], "alice.testnet");
    assert_eq!(e["data"]["by"], "owner.testnet");

    c.revoke_role(RoleName::Registrar, alice());
    assert!(!c.has_role(RoleName::Registrar, alice()));
    assert_eq!(last_event()["event"], "role_revoked");
}

#[test]
fn roles_are_independent() {
    let mut c = new_core();
    c.grant_role(RoleName::Pauser, alice());
    assert!(c.has_role(RoleName::Pauser, alice()));
    assert!(!c.has_role(RoleName::Registrar, alice()));
    assert!(!c.has_role(RoleName::CompatApprover, alice()));
}

#[test]
#[should_panic(expected = "only the owner")]
fn non_owner_cannot_grant_roles() {
    let mut c = new_core();
    as_account(alice());
    c.grant_role(RoleName::Registrar, alice());
}

#[test]
#[should_panic(expected = "only the owner")]
fn a_role_holder_cannot_grant_roles() {
    let mut c = new_core();
    c.grant_role(RoleName::Registrar, alice());
    as_account(alice());
    c.grant_role(RoleName::Registrar, bob());
}

#[test]
#[should_panic(expected = "already holds this role")]
fn granting_twice_fails() {
    let mut c = new_core();
    c.grant_role(RoleName::Pauser, alice());
    c.grant_role(RoleName::Pauser, alice());
}

#[test]
#[should_panic(expected = "does not hold this role")]
fn revoking_an_unheld_role_fails() {
    let mut c = new_core();
    c.revoke_role(RoleName::Pauser, alice());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn state_changing_methods_require_one_yocto() {
    let mut c = new_core();
    without_deposit(owner());
    c.grant_role(RoleName::Pauser, alice());
}

#[test]
fn pauser_pauses_and_only_owner_unpauses() {
    let mut c = new_core();
    c.grant_role(RoleName::Pauser, alice());
    as_account(alice());
    c.pause();
    assert!(c.is_paused());
    let e = last_event();
    assert_eq!(e["event"], "paused");
    assert_eq!(e["data"]["scope"], "global");

    as_account(owner());
    c.unpause();
    assert!(!c.is_paused());
    assert_eq!(last_event()["event"], "unpaused");
}

#[test]
#[should_panic(expected = "only the owner")]
fn a_pauser_cannot_unpause() {
    let mut c = new_core();
    c.grant_role(RoleName::Pauser, alice());
    as_account(alice());
    c.pause();
    c.unpause();
}

#[test]
#[should_panic(expected = "caller is not a pauser")]
fn non_pauser_cannot_pause() {
    let mut c = new_core();
    as_account(alice());
    c.pause();
}

#[test]
#[should_panic(expected = "caller is not a pauser")]
fn owner_is_not_implicitly_a_pauser() {
    let mut c = new_core();
    c.pause();
}

#[test]
#[should_panic(expected = "already paused")]
fn double_pause_fails() {
    let mut c = new_core();
    c.grant_role(RoleName::Pauser, alice());
    as_account(alice());
    c.pause();
    c.pause();
}

#[test]
fn owner_can_still_manage_roles_while_paused() {
    let mut c = new_core();
    c.grant_role(RoleName::Pauser, alice());
    as_account(alice());
    c.pause();
    as_account(owner());
    c.revoke_role(RoleName::Pauser, alice());
    assert!(!c.has_role(RoleName::Pauser, alice()));
}

#[test]
#[should_panic(expected = "contract is paused")]
fn registrar_actions_are_blocked_while_paused() {
    let mut c = new_core();
    c.grant_role(RoleName::Registrar, bob());
    c.grant_role(RoleName::Pauser, alice());
    as_account(alice());
    c.pause();
    as_account(bob());
    c.assert_registrar();
}

#[test]
fn ownership_transfer_is_two_step() {
    let mut c = new_core();
    c.transfer_ownership(alice());
    assert_eq!(
        c.get_owner(),
        owner(),
        "ownership must not move before acceptance"
    );
    assert_eq!(c.get_pending_owner(), Some(alice()));
    assert_eq!(last_event()["event"], "ownership_transfer_proposed");

    as_account(alice());
    c.accept_ownership();
    assert_eq!(c.get_owner(), alice());
    assert_eq!(c.get_pending_owner(), None);
    assert_eq!(last_event()["event"], "ownership_transferred");
}

#[test]
#[should_panic(expected = "only the owner")]
fn previous_owner_loses_its_powers() {
    let mut c = new_core();
    c.transfer_ownership(alice());
    as_account(alice());
    c.accept_ownership();
    as_account(owner());
    c.grant_role(RoleName::Pauser, bob());
}

#[test]
#[should_panic(expected = "not the pending owner")]
fn only_the_nominee_can_accept_ownership() {
    let mut c = new_core();
    c.transfer_ownership(alice());
    as_account(bob());
    c.accept_ownership();
}

#[test]
#[should_panic(expected = "not the pending owner")]
fn accepting_without_a_nomination_fails() {
    let mut c = new_core();
    as_account(alice());
    c.accept_ownership();
}

#[test]
#[should_panic(expected = "only the owner")]
fn non_owner_cannot_nominate_a_new_owner() {
    let mut c = new_core();
    as_account(alice());
    c.transfer_ownership(alice());
}

/// Runs the next call as this contract's own callback with the given promise result.
pub(crate) fn as_callback(result: near_sdk::PromiseResult) {
    let core = account("core.testnet");
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(core.clone())
            .predecessor_account_id(core)
            .block_timestamp(5_000 * 1_000_000)
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}
