use crate::registry_tests::{
    attest, core, new_asset, new_issuer, new_rep, pauser, registrar, token_a, token_b,
};
use crate::tests::{account, as_account, last_event, owner};
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::AccountId;

pub(crate) fn approver() -> AccountId {
    account("approver.testnet")
}

pub(crate) fn ratio(num: u128, den: u128) -> Ratio {
    Ratio {
        num: U128(num),
        den: U128(den),
    }
}

/// Registry with active `tgold-a` (6 decimals) and `tgold-b` (8 decimals) of one claim, and an
/// approver. The context is left as the approver.
pub(crate) fn two_reps() -> Contract {
    let mut c = core();
    c.register_issuer(new_issuer("iss"));
    attest(&mut c, SubjectType::Issuer, "iss");
    c.set_issuer_status("iss".into(), Status::Active);
    c.register_canonical_asset(new_asset("gold"));
    attest(&mut c, SubjectType::CanonicalAsset, "gold");
    c.set_canonical_asset_status("gold".into(), Status::Active);
    c.register_representation(new_rep("tgold-a", "iss", "gold", token_a()));
    let mut b = new_rep("tgold-b", "iss", "gold", token_b());
    b.decimals = 8;
    b.unit_multiplier = ratio(1, 1_000_000_000);
    c.register_representation(b);
    for id in ["tgold-a", "tgold-b"] {
        attest(&mut c, SubjectType::Representation, id);
        c.set_representation_status(id.into(), Status::Active);
    }
    as_account(owner());
    c.grant_role(RoleName::CompatApprover, approver());
    as_account(approver());
    c
}

pub(crate) fn propose_parity(c: &mut Contract) {
    c.propose_compatibility(
        "tgold-a".into(),
        "tgold-b".into(),
        Classification::DirectEquivalent,
        ratio(1000, 1),
        "Parity conversion of synthetic test tokens".into(),
        "Both are test representations of one synthetic claim".into(),
    );
}

fn propose(c: &mut Contract, a: &str, b: &str, class: Classification, r: Ratio, rationale: &str) {
    c.propose_compatibility(
        a.into(),
        b.into(),
        class,
        r,
        "scope".into(),
        rationale.into(),
    );
}

#[test]
fn proposal_starts_at_version_one_with_a_history_entry_and_event() {
    let mut c = two_reps();
    propose_parity(&mut c);
    let rel = c
        .get_compatibility("tgold-a".into(), "tgold-b".into())
        .unwrap();
    assert_eq!(rel.id, "tgold-a:tgold-b");
    assert_eq!(rel.status, RelationshipStatus::Proposed);
    assert_eq!(rel.classification, Classification::DirectEquivalent);
    assert_eq!(rel.ratio, ratio(1000, 1));
    assert_eq!(rel.version, 1);
    assert_eq!(rel.proposed_by, approver());
    assert_eq!(rel.approved_by, None);
    assert_eq!(rel.history.len(), 1);
    assert_eq!(rel.history[0].action, ReviewAction::Proposed);
    let e = last_event();
    assert_eq!(e["event"], "compatibility_proposed");
    assert_eq!(e["data"]["id"], "tgold-a:tgold-b");
    assert_eq!(e["data"]["version"], 1);
    assert_eq!(e["data"]["classification"], "DIRECT_EQUIVALENT");
}

#[test]
fn pair_order_does_not_matter_and_the_ratio_follows_the_stored_direction() {
    let mut c = two_reps();
    // 1 B = 1/1000 A, proposed from B's side.
    propose(
        &mut c,
        "tgold-b",
        "tgold-a",
        Classification::DirectEquivalent,
        ratio(1, 1000),
        "r",
    );
    let rel = c
        .get_compatibility("tgold-b".into(), "tgold-a".into())
        .unwrap();
    assert_eq!(rel.representation_a_id, "tgold-a");
    assert_eq!(rel.representation_b_id, "tgold-b");
    assert_eq!(
        rel.ratio,
        ratio(1000, 1),
        "inverted into the a to b direction"
    );
    assert_eq!(
        c.get_compatibility("tgold-a".into(), "tgold-b".into())
            .unwrap()
            .id,
        rel.id
    );
    assert_eq!(c.list_compatibilities(None, None).len(), 1);
}

#[test]
fn ratio_is_stored_in_lowest_terms() {
    let mut c = two_reps();
    propose(
        &mut c,
        "tgold-a",
        "tgold-b",
        Classification::EconomicallySimilar,
        ratio(2000, 2),
        "r",
    );
    assert_eq!(
        c.get_compatibility("tgold-a".into(), "tgold-b".into())
            .unwrap()
            .ratio,
        ratio(1000, 1)
    );
}

#[test]
fn lookups_of_unknown_pairs_are_empty() {
    let c = two_reps();
    assert!(c
        .get_compatibility("tgold-a".into(), "tgold-b".into())
        .is_none());
    assert!(c.list_compatibilities(None, None).is_empty());
}

#[test]
#[should_panic(expected = "caller is not a compat approver")]
fn registrar_cannot_propose() {
    let mut c = two_reps();
    as_account(registrar());
    propose_parity(&mut c);
}

#[test]
#[should_panic(expected = "caller is not a compat approver")]
fn owner_is_not_implicitly_an_approver() {
    let mut c = two_reps();
    as_account(owner());
    propose_parity(&mut c);
}

#[test]
#[should_panic(expected = "contract is paused")]
fn proposals_are_blocked_while_globally_paused() {
    let mut c = two_reps();
    as_account(pauser());
    c.pause();
    as_account(approver());
    propose_parity(&mut c);
}

#[test]
#[should_panic(expected = "two different representations")]
fn a_representation_cannot_be_paired_with_itself() {
    let mut c = two_reps();
    propose(
        &mut c,
        "tgold-a",
        "tgold-a",
        Classification::DirectEquivalent,
        ratio(1, 1),
        "r",
    );
}

#[test]
#[should_panic(expected = "representation not found")]
fn both_representations_must_exist() {
    let mut c = two_reps();
    propose(
        &mut c,
        "tgold-a",
        "ghost",
        Classification::DirectEquivalent,
        ratio(1, 1),
        "r",
    );
}

#[test]
#[should_panic(expected = "SUSPENDED is set by suspension")]
fn suspended_cannot_be_proposed() {
    let mut c = two_reps();
    propose(
        &mut c,
        "tgold-a",
        "tgold-b",
        Classification::Suspended,
        ratio(1, 1),
        "r",
    );
}

#[test]
#[should_panic(expected = "ratio parts must be positive")]
fn a_zero_ratio_is_rejected() {
    let mut c = two_reps();
    propose(
        &mut c,
        "tgold-a",
        "tgold-b",
        Classification::DirectEquivalent,
        ratio(0, 1),
        "r",
    );
}

#[test]
#[should_panic(expected = "rationale must not be empty")]
fn a_rationale_is_required() {
    let mut c = two_reps();
    propose(
        &mut c,
        "tgold-a",
        "tgold-b",
        Classification::DirectEquivalent,
        ratio(1000, 1),
        " ",
    );
}

#[test]
#[should_panic(expected = "only a rejected one can be re-proposed")]
fn an_existing_relationship_cannot_be_proposed_again() {
    let mut c = two_reps();
    propose_parity(&mut c);
    propose_parity(&mut c);
}
