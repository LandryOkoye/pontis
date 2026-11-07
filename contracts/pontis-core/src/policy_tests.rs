use crate::compat_tests::two_reps;
use crate::registry_tests::registrar;
use crate::tests::{account, alice, as_account, last_event};
use crate::*;

/// Two active representations; context left as the registrar.
fn registry() -> Contract {
    let c = two_reps();
    as_account(registrar());
    c
}

fn allow(c: &mut Contract, rep: &str, who: &[near_sdk::AccountId], allowed: bool) {
    c.set_allowlist(rep.into(), who.to_vec(), allowed);
}

#[test]
fn a_new_representation_requires_an_allowlist_and_starts_at_policy_version_one() {
    let c = registry();
    let p = c.get_policy("tgold-a".into()).unwrap();
    assert!(p.allowlist_required);
    assert_eq!(p.policy_version, 1);
    assert_eq!(c.get_policy_version(), 1);
    assert!(
        !c.is_allowed("tgold-a".into(), alice()),
        "not on the list yet"
    );
    assert!(c.get_policy("ghost".into()).is_none());
    assert!(!c.is_allowed("ghost".into(), alice()));
}

#[test]
fn allowlist_membership_is_per_representation_and_does_not_bump_the_policy_version() {
    let mut c = registry();
    allow(&mut c, "tgold-a", &[alice()], true);
    assert!(c.is_allowed("tgold-a".into(), alice()));
    assert!(!c.is_allowed("tgold-b".into(), alice()));
    assert_eq!(
        c.get_policy_version(),
        1,
        "membership changes never void quotes"
    );
    let e = last_event();
    assert_eq!(e["event"], "allowlist_updated");
    assert_eq!(e["data"]["representation_id"], "tgold-a");
    assert_eq!(e["data"]["allowed"], true);
    assert_eq!(e["data"]["account_ids"][0], "alice.testnet");

    allow(&mut c, "tgold-a", &[alice()], false);
    assert!(!c.is_allowed("tgold-a".into(), alice()));
    assert_eq!(c.get_policy_version(), 1);
}

#[test]
fn changing_the_rule_bumps_the_version_and_lifts_the_allowlist_requirement() {
    let mut c = registry();
    c.set_allowlist_required("tgold-a".into(), false);
    assert_eq!(c.get_policy_version(), 2);
    assert!(c.is_allowed("tgold-a".into(), account("anyone.testnet")));
    assert!(
        !c.is_allowed("tgold-b".into(), account("anyone.testnet")),
        "other asset unaffected"
    );
    let e = last_event();
    assert_eq!(e["event"], "policy_updated");
    assert_eq!(e["data"]["allowlist_required"], false);
    assert_eq!(e["data"]["policy_version"], 2);
}
