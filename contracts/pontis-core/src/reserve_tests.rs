use crate::custody_fixture::*;
use crate::tests::{as_account, as_account_at, last_event, owner};
use crate::*;
use near_sdk::json_types::U128;

#[test]
fn a_signed_attestation_is_stored_and_emitted() {
    let mut c = custody_core(ReserveAction::Warn);
    submit(&mut c, 5 * ONE);
    let latest = c
        .get_reserve_attestation("tgold-a".into(), Some("vault-co-sim".into()))
        .unwrap();
    assert_eq!(latest.reserved_units, U128(5 * ONE));
    assert_eq!(latest.seq, 0);
    assert_eq!(latest.submitted_ms, 5_000);
    assert!(latest.simulated);
    assert_eq!(latest.attester_key, custodian_key());
    assert_eq!(c.get_reserve_attestations("tgold-a".into()).len(), 1);
    assert_eq!(
        c.get_reserve_attestation("tgold-a".into(), None).unwrap(),
        latest
    );
    let history = c.get_reserve_history("tgold-a".into(), 0, 0);
    assert_eq!((history.total, history.items.len()), (1, 1));
    let e = last_event();
    assert_eq!(e["event"], "reserve_status_changed");
    assert_eq!(e["data"]["to_state"], "ok");
}

#[test]
fn the_attested_event_carries_the_whole_record() {
    let mut c = custody_core(ReserveAction::Warn);
    let a = attestation("tgold-a", 5 * ONE, 4_000);
    let signature = sign(&a);
    as_account(relayer());
    c.submit_reserve_attestation(a, signature, custodian_key());
    let logs = near_sdk::test_utils::get_logs();
    let line = logs
        .iter()
        .find(|l| l.contains("\"reserve_attested\""))
        .unwrap();
    let e: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(line.strip_prefix("EVENT_JSON:").unwrap()).unwrap();
    assert_eq!(e["data"]["custodian_id"], "vault-co-sim");
    assert_eq!(e["data"]["reserved_units"], (5 * ONE).to_string());
    assert_eq!(e["data"]["simulated"], true);
    assert_eq!(e["data"]["source"], "simulated_custodian");
    assert_eq!(e["data"]["seq"], 0);
}

#[test]
#[should_panic(expected = "attestation is not newer than the stored one")]
fn an_attestation_must_be_newer() {
    let mut c = custody_core(ReserveAction::Warn);
    submit_at(&mut c, ONE, 4_000, 5_000);
    submit_at(&mut c, 2 * ONE, 4_000, 5_000);
}

#[test]
#[should_panic(expected = "as_of_ms is in the future")]
fn an_attestation_cannot_come_from_the_future() {
    let mut c = custody_core(ReserveAction::Warn);
    submit_at(&mut c, ONE, 5_000 + 60_001, 5_000);
}

#[test]
#[should_panic(expected = "attestation is for another contract")]
fn an_attestation_is_bound_to_this_contract() {
    let mut c = custody_core(ReserveAction::Warn);
    let mut a = attestation("tgold-a", ONE, 4_000);
    a.contract = crate::tests::account("other.testnet");
    let signature = sign(&a);
    as_account(relayer());
    c.submit_reserve_attestation(a, signature, custodian_key());
}

#[test]
#[should_panic(expected = "bad signature")]
fn a_tampered_figure_fails_the_signature() {
    let mut c = custody_core(ReserveAction::Warn);
    let a = attestation("tgold-a", ONE, 4_000);
    let signature = sign(&a);
    let mut forged = a;
    forged.reserved_units = U128(10 * ONE);
    as_account(relayer());
    c.submit_reserve_attestation(forged, signature, custodian_key());
}

#[test]
#[should_panic(expected = "key is not this custodian's attester key")]
fn another_key_cannot_sign_for_the_custodian() {
    let mut c = custody_core(ReserveAction::Warn);
    let a = attestation("tgold-a", ONE, 4_000);
    let signature = sign(&a);
    as_account(relayer());
    c.submit_reserve_attestation(a, signature, public_of(&crate::signers_tests::key_from(9)));
}

#[test]
#[should_panic(expected = "signer is not a registered reserve attester")]
fn a_removed_signer_key_stops_attestations() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(owner());
    c.remove_signer_key(RoleName::ReserveAttester, custodian_key());
    submit(&mut c, ONE);
}

#[test]
#[should_panic(expected = "signer is not a registered reserve attester")]
fn revoking_the_attester_role_stops_attestations() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(owner());
    c.revoke_role(RoleName::ReserveAttester, custodian_account());
    submit(&mut c, ONE);
}

#[test]
#[should_panic(expected = "custodian is not active")]
fn a_suspended_custodian_cannot_attest() {
    let mut c = custody_core(ReserveAction::Warn);
    c.set_custodian_status("vault-co-sim".into(), CustodianStatus::Suspended);
    submit(&mut c, ONE);
}

#[test]
#[should_panic(expected = "custodian is not linked to this representation")]
fn an_unlinked_representation_takes_no_attestation() {
    let mut c = custody_core(ReserveAction::Warn);
    let a = attestation("tgold-b", ONE, 4_000);
    let signature = sign(&a);
    as_account(relayer());
    c.submit_reserve_attestation(a, signature, custodian_key());
}

#[test]
#[should_panic(expected = "report_hash must be 64 lowercase hex characters")]
fn a_malformed_report_hash_is_refused() {
    let mut c = custody_core(ReserveAction::Warn);
    let mut a = attestation("tgold-a", ONE, 4_000);
    a.report_hash = "XY".repeat(32);
    let signature = sign(&attestation("tgold-a", ONE, 4_000));
    as_account(relayer());
    c.submit_reserve_attestation(a, signature, custodian_key());
}

#[test]
#[should_panic(expected = "reserved_units is above 2^100")]
fn an_absurd_figure_is_refused() {
    let mut c = custody_core(ReserveAction::Warn);
    submit(&mut c, MAX_RESERVED_UNITS + 1);
}

#[test]
#[should_panic(expected = "contract is paused")]
fn attestations_stop_while_paused() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(crate::registry_tests::pauser());
    c.pause();
    submit(&mut c, ONE);
}

#[test]
fn history_is_a_ring_of_the_last_500() {
    let mut c = custody_core(ReserveAction::Warn);
    for i in 0..(HISTORY_RING + 3) {
        submit_at(&mut c, ONE + u128::from(i), 1_000 + i, 5_000);
    }
    let page = c.get_reserve_history("tgold-a".into(), 0, 100);
    assert_eq!(page.total, HISTORY_RING + 3);
    assert_eq!(page.items.len(), 100);
    assert_eq!(page.items[0].seq, 3, "the three oldest are gone");
    let tail = c.get_reserve_history("tgold-a".into(), HISTORY_RING + 1, 100);
    assert_eq!(
        tail.items.iter().map(|r| r.seq).collect::<Vec<_>>(),
        vec![HISTORY_RING + 1, HISTORY_RING + 2]
    );
    assert_eq!(
        tail.items[1].reserved_units,
        U128(ONE + u128::from(HISTORY_RING + 2))
    );
}

#[test]
fn a_policy_is_validated_and_its_baseline_is_fixed() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(owner());
    let mut p = policy(ReserveAction::PauseMint);
    p.tolerance_bps = 50;
    c.set_reserve_policy("tgold-a".into(), p.clone());
    assert_eq!(c.get_reserve_policy("tgold-a".into()).unwrap(), p);
    assert_eq!(last_event()["event"], "reserve_policy_set");
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut bad = p.clone();
        bad.baseline_supply = U128(1);
        c.set_reserve_policy("tgold-a".into(), bad);
    }));
    assert!(result.is_err(), "the baseline cannot change");
}

#[test]
#[should_panic(expected = "tolerance_bps is at most 1000")]
fn tolerance_is_capped() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(owner());
    let mut p = policy(ReserveAction::Warn);
    p.tolerance_bps = 1_001;
    c.set_reserve_policy("tgold-a".into(), p);
}

#[test]
#[should_panic(expected = "max_reserve_age_ms must be between 1 minute and 30 days")]
fn the_age_limit_has_a_floor() {
    let mut c = custody_core(ReserveAction::Warn);
    as_account(owner());
    let mut p = policy(ReserveAction::Warn);
    p.max_reserve_age_ms = 59_999;
    c.set_reserve_policy("tgold-a".into(), p);
}

#[test]
#[should_panic(expected = "only the owner can call this method")]
fn only_the_owner_sets_a_policy() {
    let mut c = custody_core(ReserveAction::Warn);
    c.set_reserve_policy("tgold-a".into(), policy(ReserveAction::Warn));
}

#[test]
fn the_clock_alone_does_not_change_stored_state_but_evaluate_emits() {
    let mut c = custody_core(ReserveAction::RestrictConversions);
    submit(&mut c, ONE);
    as_account_at(relayer(), 4_000 + HOUR_MS + 1);
    assert_eq!(
        c.get_reserve_status("tgold-a".into()).state,
        ReserveState::Stale
    );
    c.evaluate_reserve("tgold-a".into());
    let e = last_event();
    assert_eq!(e["event"], "reserve_status_changed");
    assert_eq!(e["data"]["from_state"], "ok");
    assert_eq!(e["data"]["to_state"], "stale");
}
