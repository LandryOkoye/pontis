//! Custody, reserves and the gated mint on a sandbox (ADR 0020 sections 2 to 6, brief §6.5): the
//! custodian attests, the issuer's back office mints only within the attested headroom, supply
//! above the reserves closes the route and a fresh attestation reopens it. A refused call is a
//! wasm trap here, so refusals are asserted through state.

mod common;

use common::*;
use serde_json::{json, Value};

async fn history_total(env: &Env) -> anyhow::Result<u64> {
    let page = env
        .core_view(
            "get_reserve_history",
            json!({"representation_id": "tgold-a", "from_index": 0, "limit": 100}),
        )
        .await?;
    Ok(page["total"].as_u64().unwrap())
}

async fn total_supply(env: &Env) -> anyhow::Result<u128> {
    let v: String = env.token_a.view("ft_total_supply").await?.json()?;
    Ok(v.parse()?)
}

#[tokio::test]
async fn the_back_office_mints_within_the_attested_headroom_and_not_above() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.setup_custody("restrict_conversions", 3_600_000, 0)
        .await?;
    let alice = env.alice.id().clone();

    // No attestation, no headroom: the mint is refused and nothing moves.
    let r = env.mint_through_gate(&alice, 4 * ONE_A).await?;
    assert!(r.is_failure());
    assert_eq!(env.balance(&env.token_a, &alice).await?, 0);

    env.attest_now(10 * ONE_A).await?.into_result()?;
    let status = env.reserve_status().await?;
    assert_eq!(status["state"], "ok");
    assert_eq!(status["headroom_units"], (10 * ONE_A).to_string());
    assert_eq!(status["simulated"], true);

    env.mint_through_gate(&alice, 4 * ONE_A)
        .await?
        .into_result()?;
    assert_eq!(env.balance(&env.token_a, &alice).await?, 4 * ONE_A);
    let supply = env.supply_view().await?;
    assert_eq!(supply["ledger"], (4 * ONE_A).to_string());
    assert_eq!(supply["pending"], "0");

    // 7 more would exceed the 10 attested: refused, state unchanged.
    let r = env.mint_through_gate(&alice, 7 * ONE_A).await?;
    assert!(r.is_failure());
    assert_eq!(env.balance(&env.token_a, &alice).await?, 4 * ONE_A);
    assert_eq!(env.supply_view().await?["ledger"], (4 * ONE_A).to_string());

    env.mint_through_gate(&alice, 6 * ONE_A)
        .await?
        .into_result()?;
    assert_eq!(total_supply(&env).await?, 10 * ONE_A);
    assert_eq!(
        env.reserve_status().await?["headroom_units"],
        "0",
        "the headroom is used up"
    );

    // The gate is the only way supply grows: the owner mint and the faucet are closed.
    let r = env
        .owner
        .call(env.token_a.id(), "mint")
        .args_json(json!({"account_id": alice, "amount": "1"}))
        .deposit(yocto(1))
        .transact()
        .await?;
    assert!(r.is_failure());
    assert_eq!(total_supply(&env).await?, 10 * ONE_A);
    Ok(())
}

#[tokio::test]
async fn supply_above_the_reserves_closes_the_route_until_a_new_attestation() -> anyhow::Result<()>
{
    let env = funded().await?;
    // `funded` minted 15 A before the gate; the policy's baseline accounts for it.
    env.setup_custody("restrict_conversions", 3_600_000, 15 * ONE_A)
        .await?;
    env.attest_now(20 * ONE_A).await?.into_result()?;
    env.mint_through_gate(env.alice.id(), 5 * ONE_A)
        .await?
        .into_result()?;
    assert_eq!(env.refusal().await?, Value::Null);

    // The custodian reports only 10: 20 are in circulation. The route closes for both legs.
    env.advance_to(env.now_ms().await? + 1_000).await?;
    env.attest_now(10 * ONE_A).await?.into_result()?;
    assert_eq!(env.reserve_status().await?["state"], "breached");
    assert_eq!(env.refusal().await?, "reserve_restricted");
    let msg = env.signed_msg_with_fee(&env.alice, ONE_A, 10, 2).await?;
    let before = env.balance(&env.token_a, env.alice.id()).await?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert!(result.is_success(), "{:?}", result.failures());
    let rejected = events(&result, "conversion_rejected");
    assert_eq!(rejected[0]["data"]["reason"], "RESERVE_RESTRICTED");
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, before);
    let guards = env
        .core_view(
            "get_route_guards",
            json!({"from_id": "tgold-a", "to_id": "tgold-b", "amount_in": null}),
        )
        .await?;
    assert!(guards["checks"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c["name"] == "reserves" && c["passed"] == false));

    // A fresh attestation above the supply reopens it and the conversion goes through.
    env.advance_to(env.now_ms().await? + 1_000).await?;
    env.attest_now(25 * ONE_A).await?.into_result()?;
    assert_eq!(env.refusal().await?, Value::Null);
    let msg = env.signed_msg_with_fee(&env.alice, ONE_A, 10, 2).await?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert_eq!(
        events(&result, "conversion_completed").len(),
        1,
        "{:?}",
        result.logs()
    );
    Ok(())
}

#[tokio::test]
async fn a_stale_attestation_closes_the_route_until_refreshed() -> anyhow::Result<()> {
    let env = funded().await?;
    env.setup_custody("restrict_conversions", 60_000, 15 * ONE_A)
        .await?;
    env.attest_now(20 * ONE_A).await?.into_result()?;
    assert_eq!(env.refusal().await?, Value::Null);
    env.advance_to(env.now_ms().await? + 61_000).await?;
    assert_eq!(env.reserve_status().await?["state"], "stale");
    assert_eq!(env.refusal().await?, "reserve_stale");
    // `evaluate_reserve` records the change as an event for the indexer.
    let r = env
        .call_as(
            &env.alice,
            "evaluate_reserve",
            json!({"representation_id": "tgold-a"}),
        )
        .await?;
    assert_eq!(
        events(&r, "reserve_status_changed")[0]["data"]["to_state"],
        "stale"
    );
    env.attest_now(20 * ONE_A).await?.into_result()?;
    assert_eq!(env.refusal().await?, Value::Null);
    Ok(())
}

#[tokio::test]
async fn forged_replayed_and_unregistered_attestations_change_nothing() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.setup_custody("warn", 3_600_000, 0).await?;
    let t = env.now_ms().await?;
    let good = env.attestation(10 * ONE_A, t);
    env.submit_reserve(&good).await?.into_result()?;
    assert_eq!(history_total(&env).await?, 1);

    // Replay of the same as_of, and a tampered figure under the old signature.
    assert!(env.submit_reserve(&good).await?.is_failure());
    let mut forged = env.attestation(999 * ONE_A, t + 1);
    forged["reserved_units"] = json!((999 * ONE_A).to_string());
    let sig = {
        use base64::Engine;
        use ed25519_dalek::Signer;
        let honest = env.attestation(10 * ONE_A, t + 1);
        base64::engine::general_purpose::STANDARD.encode(
            common::reserve_seed()
                .sign(&env.reserve_message(&honest))
                .to_bytes(),
        )
    };
    let r = env.call_as(&env.alice, "submit_reserve_attestation",
        json!({"attestation": forged, "signature": sig, "public_key": env.reserve_public_key()})).await?;
    assert!(r.is_failure());
    // Another contract in the payload.
    let mut other = env.attestation(10 * ONE_A, t + 2);
    other["contract"] = json!("other.test.near");
    assert!(env.submit_reserve(&other).await?.is_failure());
    assert_eq!(history_total(&env).await?, 1);

    // Removing the signer key stops attestations at once.
    env.admin(
        "remove_signer_key",
        json!({"role": "reserve_attester", "public_key": env.reserve_public_key()}),
    )
    .await?
    .into_result()?;
    assert!(env
        .submit_reserve(&env.attestation(10 * ONE_A, t + 3))
        .await?
        .is_failure());
    assert_eq!(history_total(&env).await?, 1);
    Ok(())
}

#[tokio::test]
async fn supply_created_outside_the_gate_is_found_by_a_supply_read() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.setup_custody("warn", 3_600_000, 0).await?;
    env.attest_now(10 * ONE_A).await?.into_result()?;
    // The owner re-opens the token and mints 100 unbacked units; the ledger cannot see them.
    env.owner
        .call(env.token_a.id(), "set_minter")
        .args_json(json!({"minter": null}))
        .deposit(yocto(1))
        .transact()
        .await?
        .into_result()?;
    env.mint(&env.token_a, env.alice.id(), 100 * ONE_A).await?;
    assert_eq!(env.reserve_status().await?["state"], "ok");
    // The permissionless read stores the token's real supply and the status breaches.
    let r = env
        .call_as(
            &env.bob,
            "refresh_supply",
            json!({"representation_id": "tgold-a"}),
        )
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(
        events(&r, "reserve_supply_read")[0]["data"]["supply"],
        (100 * ONE_A).to_string()
    );
    let status = env.reserve_status().await?;
    assert_eq!(status["state"], "breached");
    assert_eq!(status["circulating_units"], (100 * ONE_A).to_string());
    assert_eq!(
        events(&r, "reserve_status_changed")[0]["data"]["to_state"],
        "breached"
    );
    Ok(())
}
