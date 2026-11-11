//! A split of one claim against another claim's wrapper: `epoch_mismatch` and the rebase of the
//! relationship (ADR 0017 section 3).

use crate::action_route_tests::*;
use crate::actions_tests::*;
use crate::compat_tests::{approver, ratio};
use crate::registry_tests::{attest, new_asset, new_issuer, new_rep, registrar};
use crate::tests::{account, alice, as_account, as_account_at};
use crate::*;

/// Adds the claim `silver` with `tsilver` (same multiplier as `tgold-a`) and an approved 1:1
/// relationship to `tgold-a`. The context is left as the registrar.
fn with_cross_asset_pair() -> Contract {
    let mut c = scheduled();
    as_account(registrar());
    let mut issuer = new_issuer("iss-silver");
    issuer.controlled_accounts = vec![account("tsilver.testnet")];
    c.register_issuer(issuer);
    attest(&mut c, SubjectType::Issuer, "iss-silver");
    c.set_issuer_status("iss-silver".into(), Status::Active);
    c.register_canonical_asset(new_asset("silver"));
    attest(&mut c, SubjectType::CanonicalAsset, "silver");
    c.set_canonical_asset_status("silver".into(), Status::Active);
    c.register_representation(new_rep(
        "tsilver",
        "iss-silver",
        "silver",
        account("tsilver.testnet"),
    ));
    attest(&mut c, SubjectType::Representation, "tsilver");
    c.set_representation_status("tsilver".into(), Status::Active);
    as_account(approver());
    c.propose_compatibility(
        "tgold-a".into(),
        "tsilver".into(),
        Classification::DirectEquivalent,
        ratio(1, 1),
        "Parity".into(),
        "Same unit".into(),
    );
    c.add_compatibility_evidence(
        "tgold-a".into(),
        "tsilver".into(),
        crate::registry_tests::evidence(Provenance::IssuerProvided),
    );
    c.approve_compatibility("tgold-a".into(), "tsilver".into(), "Reviewed".into());
    c
}

fn cross(c: &Contract, at: u64) -> RouteView {
    as_account_at(alice(), at);
    c.get_route("tgold-a".into(), "tsilver".into())
}

#[test]
fn a_split_of_one_side_only_refuses_the_cross_asset_pair_until_it_is_rebased() {
    let mut c = with_cross_asset_pair();
    assert_eq!(
        c.get_approved_multipliers("tgold-a".into(), "tsilver".into()),
        Some((ratio(1, 1_000_000), ratio(1, 1_000_000)))
    );
    assert!(cross(&c, BEFORE_FREEZE).executable);
    apply_at(&mut c, "tgold-a", EFFECTIVE);
    apply_at(&mut c, "tgold-b", EFFECTIVE);
    assert_eq!(
        cross(&c, AFTER_FREEZE).refusal,
        Some(RouteRefusal::EpochMismatch)
    );
    // Re-propose at the ratio the new multipliers give: a new version, approved again.
    as_account_at(approver(), AFTER_FREEZE);
    c.propose_compatibility(
        "tgold-a".into(),
        "tsilver".into(),
        Classification::DirectEquivalent,
        ratio(1, 2),
        "Rebased".into(),
        "After the gold split".into(),
    );
    assert_eq!(
        cross(&c, AFTER_FREEZE).refusal,
        Some(RouteRefusal::RelationshipNotApproved)
    );
    as_account_at(approver(), AFTER_FREEZE);
    c.approve_compatibility("tgold-a".into(), "tsilver".into(), "Rebased".into());
    let terms = cross(&c, AFTER_FREEZE).terms.unwrap();
    assert_eq!(terms.ratio, ratio(1, 2));
    assert_eq!(
        c.get_approved_multipliers("tgold-a".into(), "tsilver".into()),
        Some((ratio(1, 2_000_000), ratio(1, 1_000_000)))
    );
}

#[test]
#[should_panic(expected = "a corporate action is in progress on one of the assets")]
fn a_relationship_cannot_be_approved_while_an_action_is_in_progress() {
    let mut c = with_cross_asset_pair();
    as_account_at(approver(), AFTER_FREEZE);
    c.suspend_compatibility("tgold-a".into(), "tsilver".into(), "Pause".into());
    c.approve_compatibility("tgold-a".into(), "tsilver".into(), "Too early".into());
}

#[test]
#[should_panic(expected = "relationship already exists; only a rejected one can be re-proposed")]
fn a_matching_relationship_cannot_be_re_proposed() {
    let mut c = with_cross_asset_pair();
    as_account_at(approver(), BEFORE_FREEZE);
    c.propose_compatibility(
        "tgold-a".into(),
        "tsilver".into(),
        Classification::DirectEquivalent,
        ratio(1, 1),
        "Again".into(),
        "Nothing moved".into(),
    );
}
