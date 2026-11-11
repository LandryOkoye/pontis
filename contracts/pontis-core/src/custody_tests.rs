use crate::custody_fixture::*;
use crate::registry_tests::{pauser, registrar};
use crate::tests::{alice, as_account, last_event, new_core, owner};
use crate::*;

#[test]
fn registering_a_custodian_stores_it_active_and_emits() {
    let c = custody_core(ReserveAction::Warn);
    let custodian = c.get_custodian("vault-co-sim".into()).unwrap();
    assert_eq!(custodian.status, CustodianStatus::Active);
    assert_eq!(custodian.attester_key, custodian_key());
    assert!(custodian.synthetic);
    assert_eq!(custodian.evidence.len(), 1);
    assert_eq!(c.get_custodians(0, 0).total, 1);
    let link = c.get_custody_link("tgold-a".into()).unwrap();
    assert_eq!(link.structure, CustodyStructure::Segregated);
    assert_eq!(link.custodian_ids, vec!["vault-co-sim"]);
}

#[test]
fn the_registration_event_names_the_key() {
    let mut c = custody_core(ReserveAction::Warn);
    let sk = crate::signers_tests::key_from(9);
    as_account(owner());
    c.grant_role(RoleName::ReserveAttester, alice());
    c.add_signer_key(
        RoleName::ReserveAttester,
        alice(),
        public_of(&sk),
        vec!["reserves".to_string()],
    );
    as_account(registrar());
    c.register_custodian(new_custodian("vault-co-two", public_of(&sk)));
    let e = last_event();
    assert_eq!(e["event"], "custodian_registered");
    assert_eq!(e["data"]["id"], "vault-co-two");
    assert_eq!(e["data"]["by"], "registrar.testnet");
    assert_eq!(c.get_custodians(0, 1).items.len(), 1);
    assert_eq!(c.get_custodians(1, 5).items[0].id, "vault-co-two");
}

#[test]
#[should_panic(expected = "key is not a registered reserve attester key")]
fn an_unregistered_key_cannot_be_a_custodian_key() {
    let mut c = custody_core(ReserveAction::Warn);
    c.register_custodian(new_custodian(
        "vault-co-two",
        public_of(&crate::signers_tests::key_from(9)),
    ));
}

#[test]
#[should_panic(expected = "caller is not a registrar")]
fn only_a_registrar_registers_custodians() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(owner());
    c.register_custodian(new_custodian("vault-co-two", custodian_key()));
}

#[test]
#[should_panic(expected = "custodian already exists")]
fn a_custodian_id_is_unique() {
    let mut c = custody_core(ReserveAction::Warn);
    c.register_custodian(new_custodian("vault-co-sim", custodian_key()));
}

#[test]
#[should_panic(expected = "independently_verified is not available")]
fn independently_verified_is_refused() {
    let mut c = custody_core(ReserveAction::Warn);
    let mut n = new_custodian("vault-co-two", custodian_key());
    n.verification_status = VerificationStatus::IndependentlyVerified;
    c.register_custodian(n);
}

#[test]
#[should_panic(expected = "verification_status is not supported by the evidence")]
fn a_claimed_status_needs_matching_evidence() {
    let mut c = custody_core(ReserveAction::Warn);
    let mut n = new_custodian("vault-co-two", custodian_key());
    n.verification_status = VerificationStatus::ThirdPartyAttested;
    c.register_custodian(n);
}

#[test]
fn status_moves_follow_the_rules_and_retired_is_final() {
    let mut c = custody_core(ReserveAction::Warn);
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Suspended);
    assert_eq!(last_event()["data"]["to"], "suspended");
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Active);
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Retired);
    assert_eq!(
        c.get_custodian("vault-co-sim".into()).unwrap().status,
        CustodianStatus::Retired
    );
}

#[test]
#[should_panic(expected = "status change is not allowed")]
fn a_retired_custodian_stays_retired() {
    let mut c = custody_core(ReserveAction::Warn);
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Retired);
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Active);
}

#[test]
#[should_panic(expected = "custodian is retired")]
fn a_retired_custodian_keeps_its_key() {
    let mut c = custody_core(ReserveAction::Warn);
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Retired);
    c.set_custodian_key("vault-co-sim".into(), custodian_key());
}

#[test]
#[should_panic(expected = "custodian not found or not active")]
fn a_link_needs_active_custodians() {
    let mut c = custody_core(ReserveAction::Warn);
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Suspended);
    c.link_custody(
        "tgold-b".into(),
        CustodyStructure::Omnibus,
        vec!["vault-co-sim".into()],
    );
}

#[test]
#[should_panic(expected = "duplicate custodian")]
fn a_link_names_each_custodian_once() {
    let mut c = custody_core(ReserveAction::Warn);
    c.link_custody(
        "tgold-b".into(),
        CustodyStructure::Omnibus,
        vec!["vault-co-sim".into(), "vault-co-sim".into()],
    );
}

#[test]
fn relinking_replaces_the_link_and_emits() {
    let mut c = custody_core(ReserveAction::Warn);
    c.link_custody(
        "tgold-a".into(),
        CustodyStructure::OnChainVault,
        vec!["vault-co-sim".into()],
    );
    assert_eq!(
        c.get_custody_link("tgold-a".into()).unwrap().structure,
        CustodyStructure::OnChainVault
    );
    assert_eq!(last_event()["event"], "custody_linked");
    assert!(c.get_custody_link("tgold-b".into()).is_none());
}

#[test]
#[should_panic(expected = "contract is paused")]
fn custody_changes_stop_while_paused() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(pauser());
    c.pause();
    as_account(registrar());
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Suspended);
}

#[test]
fn a_fresh_core_has_no_custodians() {
    let c = new_core();
    assert_eq!(c.get_custodians(0, 0).total, 0);
    assert!(c.get_custodian("x".into()).is_none());
}
