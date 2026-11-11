//! `submit_price`: acceptance, the refusal rules, replay and the pause (ADR 0016 section 1).

use crate::price_tests::*;
use crate::registry_tests::pauser;
use crate::tests::{account, as_account, as_account_at, last_event, owner};
use crate::*;
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{CurveType, PublicKey};

#[test]
fn a_signed_price_is_stored_labelled_and_evented() {
    let mut c = core_with_publisher();
    as_account_at(account("relayer.testnet"), 5_000);
    submit(&mut c, "tgold-a", 268_142_585_338, 4_000);
    let p = c.get_price("tgold-a".into()).unwrap();
    assert_eq!(
        (p.price.0, p.currency.as_str(), p.as_of_ms, p.submitted_ms),
        (268_142_585_338, "USD", 4_000, 5_000)
    );
    assert!(p.simulated);
    assert_eq!(p.source, "simulated_feed");
    assert_eq!(p.publisher_key, publisher_key());
    let e = last_event();
    assert_eq!(e["event"], "price_submitted");
    assert_eq!(e["data"]["simulated"], true);
    assert_eq!(e["data"]["price"], "268142585338");
    assert_eq!(c.get_price("tgold-b".into()), None);
}

/// The refusal message of `submit_price`, or `None` if it was accepted. Storage persists across
/// `testing_env!` calls in a test, so cases share one contract instead of building several.
pub(crate) fn try_submit(
    c: &mut Contract,
    a: PriceAttestation,
    signature: Base64VecU8,
    key: PublicKey,
) -> Option<String> {
    as_account(account("relayer.testnet"));
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.submit_price(a, signature, key)
    }));
    result.err().map(|e| {
        e.downcast_ref::<String>()
            .cloned()
            .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default()
    })
}

#[test]
fn a_price_is_refused_unless_every_rule_holds() {
    let mut c = core_with_publisher();
    let base = || attestation("tgold-a", 1, 4_000);
    let cases: Vec<(&str, PriceAttestation, &str)> = vec![
        ("zero", attestation("tgold-a", 0, 4_000), "positive"),
        (
            "too large",
            attestation("tgold-a", u128::from(u64::MAX) + 1, 4_000),
            "positive and at most",
        ),
        (
            "unknown representation",
            attestation("ghost", 1, 4_000),
            "representation not found",
        ),
        (
            "future",
            attestation("tgold-a", 1, 5_000 + 60_001),
            "in the future",
        ),
        (
            "bad version",
            PriceAttestation {
                version: 2,
                ..base()
            },
            "unsupported version",
        ),
        (
            "other contract",
            PriceAttestation {
                contract: account("other.testnet"),
                ..base()
            },
            "another contract",
        ),
        (
            "lower-case currency",
            PriceAttestation {
                currency: "usd".into(),
                ..base()
            },
            "invalid currency",
        ),
        (
            "long currency",
            PriceAttestation {
                currency: "ABCDEFGHI".into(),
                ..base()
            },
            "invalid currency",
        ),
    ];
    for (name, a, expected) in cases {
        let s = sign_price(&a);
        let msg = try_submit(&mut c, a, s, publisher_key()).unwrap_or_default();
        assert!(msg.contains(expected), "{name}: {msg}");
    }
    assert_eq!(c.get_price("tgold-a".into()), None, "nothing was stored");
    // The same payload with every field valid goes through.
    let ok = base();
    let s = sign_price(&ok);
    assert_eq!(try_submit(&mut c, ok, s, publisher_key()), None);
}

#[test]
fn a_forged_unregistered_or_altered_price_is_refused() {
    let mut c = core_with_publisher();
    let a = attestation("tgold-a", 100, 4_000);
    let good = sign_price(&a);
    let altered = PriceAttestation {
        price: U128(101),
        ..a.clone()
    };
    let msg = try_submit(&mut c, altered, good.clone(), publisher_key()).unwrap_or_default();
    assert!(msg.contains("bad signature"), "{msg}");

    let other = PublicKey::from_parts(CurveType::ED25519, vec![9; 32]).unwrap();
    let msg = try_submit(&mut c, a.clone(), good, other).unwrap_or_default();
    assert!(msg.contains("not a registered price publisher"), "{msg}");

    let msg = try_submit(&mut c, a, Base64VecU8(vec![0; 64]), publisher_key()).unwrap_or_default();
    assert!(msg.contains("bad signature"), "{msg}");
    assert_eq!(c.get_price("tgold-a".into()), None);
}

#[test]
fn a_price_must_be_strictly_newer_than_the_stored_one() {
    let mut c = core_with_publisher();
    submit(&mut c, "tgold-a", 100, 4_000);
    for as_of in [4_000, 3_999] {
        let a = attestation("tgold-a", 200, as_of);
        let s = sign_price(&a);
        let msg = try_submit(&mut c, a, s, publisher_key()).unwrap_or_default();
        assert!(msg.contains("not newer"), "as_of {as_of}: {msg}");
    }
    submit(&mut c, "tgold-a", 200, 4_001);
    assert_eq!(c.get_price("tgold-a".into()).unwrap().price.0, 200);
}

#[test]
#[should_panic(expected = "contract is paused")]
fn a_price_cannot_be_submitted_while_paused() {
    let mut c = core_with_publisher();
    as_account(pauser());
    c.pause();
    as_account_at(account("relayer.testnet"), 5_000);
    submit(&mut c, "tgold-a", 100, 4_000);
}

#[test]
fn a_removed_key_stops_new_submissions_but_keeps_the_stored_price() {
    let mut c = core_with_publisher();
    submit(&mut c, "tgold-a", 100, 4_000);
    as_account(owner());
    c.remove_price_publisher_key(publisher_key());
    assert_eq!(c.get_price("tgold-a".into()).unwrap().price.0, 100);
    let a = attestation("tgold-a", 101, 4_500);
    let s = sign_price(&a);
    let msg = try_submit(&mut c, a, s, publisher_key()).unwrap_or_default();
    assert!(msg.contains("not a registered price publisher"), "{msg}");
}
