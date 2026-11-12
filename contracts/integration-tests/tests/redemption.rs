//! The redemption lifecycle on a sandbox (ADR 0020 section 7, brief §6.5): a user redeems and the
//! back office fulfils (escrow burned); another request is rejected or left to expire and the user
//! reclaims the escrow. The conservation invariant is checked after every step, against the
//! core's real token balance. A refused call is a wasm trap here, so refusals are asserted through
//! state.

mod common;

use common::*;
use serde_json::json;

async fn total_supply(env: &Env) -> anyhow::Result<u128> {
    let v: String = env.token_a.view("ft_total_supply").await?.json()?;
    Ok(v.parse()?)
}

fn id_of(result: &near_workspaces::result::ExecutionFinalResult) -> u64 {
    events(result, "redemption_requested")[0]["data"]["id"]
        .as_u64()
        .unwrap()
}

#[tokio::test]
async fn a_redemption_is_fulfilled_and_the_escrow_is_burned() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.minted_holder(env.alice.id(), 100 * ONE_A, 10 * ONE_A)
        .await?;
    env.set_terms(3_600_000).await?;
    let hash = env.terms_hash().await?;

    let r = env.redeem(&env.alice, 4 * ONE_A, &hash).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let id = id_of(&r);
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 6 * ONE_A);
    let record = env.redemption(id).await?;
    assert_eq!(record["status"], "requested");
    assert_eq!(record["fee_units"], "10000");
    assert_eq!(record["net_units"], "3990000");
    env.assert_conserved().await?;

    env.call_as(&env.carol, "accept_redemption", json!({"id": id}))
        .await?
        .into_result()?;
    assert_eq!(env.redemption(id).await?["status"], "accepted");
    let evidence = "cd".repeat(32);
    let r = env
        .call_as(
            &env.carol,
            "fulfil_redemption",
            json!({"id": id, "evidence_hash": evidence}),
        )
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(events(&r, "redemption_fulfilled").len(), 1);
    let record = env.redemption(id).await?;
    assert_eq!(record["status"], "fulfilled");
    assert_eq!(record["settling"], false);
    assert_eq!(record["fulfilment_evidence_hash"], evidence);
    // The escrow is burned: supply fell, the ledger followed and nothing is held.
    assert_eq!(total_supply(&env).await?, 6 * ONE_A);
    assert_eq!(env.supply_view().await?["ledger"], (6 * ONE_A).to_string());
    assert_eq!(env.escrow().await?["burned"], (4 * ONE_A).to_string());
    assert_eq!(env.escrow().await?["held"], "0");
    env.assert_conserved().await?;
    let rel = env
        .core_view("get_issuer_reliability", json!({"issuer_id": "issuer-a"}))
        .await?;
    assert_eq!(
        (rel["requested"].as_u64(), rel["fulfilled"].as_u64()),
        (Some(1), Some(1))
    );
    // A fulfilled request cannot be reclaimed.
    assert!(env
        .call_as(&env.alice, "reclaim_redemption", json!({"id": id}))
        .await?
        .is_failure());
    assert_eq!(env.redemption(id).await?["status"], "fulfilled");
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 6 * ONE_A);
    Ok(())
}

#[tokio::test]
async fn a_rejected_request_returns_the_escrow_on_reclaim() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.minted_holder(env.alice.id(), 100 * ONE_A, 10 * ONE_A)
        .await?;
    env.set_terms(3_600_000).await?;
    let hash = env.terms_hash().await?;
    let id = id_of(&env.redeem(&env.alice, 3 * ONE_A, &hash).await?);
    env.call_as(
        &env.carol,
        "reject_redemption",
        json!({"id": id, "reason": "KYC_FAILED"}),
    )
    .await?
    .into_result()?;
    assert_eq!(env.redemption(id).await?["status"], "rejected");
    assert_eq!(
        env.balance(&env.token_a, env.alice.id()).await?,
        7 * ONE_A,
        "still escrowed"
    );
    env.assert_conserved().await?;
    // Only the user reclaims.
    assert!(env
        .call_as(&env.bob, "reclaim_redemption", json!({"id": id}))
        .await?
        .is_failure());
    assert_eq!(env.redemption(id).await?["status"], "rejected");
    let r = env
        .call_as(&env.alice, "reclaim_redemption", json!({"id": id}))
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(events(&r, "redemption_reclaimed").len(), 1);
    assert_eq!(env.redemption(id).await?["status"], "reclaimed");
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 10 * ONE_A);
    assert_eq!(env.escrow().await?["returned"], (3 * ONE_A).to_string());
    env.assert_conserved().await?;
    assert_eq!(total_supply(&env).await?, 10 * ONE_A, "nothing was burned");
    Ok(())
}

#[tokio::test]
async fn an_unanswered_request_expires_and_the_user_reclaims() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.minted_holder(env.alice.id(), 100 * ONE_A, 10 * ONE_A)
        .await?;
    env.set_terms(5_000).await?;
    let hash = env.terms_hash().await?;
    let id = id_of(&env.redeem(&env.alice, 2 * ONE_A, &hash).await?);
    // Not overdue yet: expiring and reclaiming change nothing.
    assert!(env
        .call_as(&env.bob, "expire_redemption", json!({"id": id}))
        .await?
        .is_failure());
    assert!(env
        .call_as(&env.alice, "reclaim_redemption", json!({"id": id}))
        .await?
        .is_failure());
    assert_eq!(env.redemption(id).await?["status"], "requested");

    let deadline = env.redemption(id).await?["accept_deadline_ms"]
        .as_u64()
        .unwrap();
    env.advance_to(deadline + 1_000).await?;
    // A late accept is refused.
    assert!(env
        .call_as(&env.carol, "accept_redemption", json!({"id": id}))
        .await?
        .is_failure());
    assert_eq!(env.redemption(id).await?["status"], "requested");
    let r = env
        .call_as(&env.bob, "expire_redemption", json!({"id": id}))
        .await?;
    assert_eq!(
        events(&r, "redemption_expired")[0]["data"]["miss"],
        "accept"
    );
    let record = env.redemption(id).await?;
    assert_eq!(
        (record["status"].as_str(), record["miss"].as_str()),
        (Some("expired"), Some("accept"))
    );
    let rel = env
        .core_view("get_issuer_reliability", json!({"issuer_id": "issuer-a"}))
        .await?;
    assert_eq!(
        (rel["expired"].as_u64(), rel["accept_misses"].as_u64()),
        (Some(1), Some(1))
    );
    env.assert_conserved().await?;

    env.call_as(&env.alice, "reclaim_redemption", json!({"id": id}))
        .await?
        .into_result()?;
    assert_eq!(env.redemption(id).await?["status"], "reclaimed");
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 10 * ONE_A);
    env.assert_conserved().await?;
    Ok(())
}

#[tokio::test]
async fn terms_are_enforced_and_a_refusal_returns_the_transfer() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.minted_holder(env.alice.id(), 100 * ONE_A, 10 * ONE_A)
        .await?;
    env.set_terms(3_600_000).await?;
    let old = env.terms_hash().await?;
    let refused = |r: &near_workspaces::result::ExecutionFinalResult, reason: &str| {
        assert!(r.is_success(), "{:?}", r.failures());
        assert_eq!(events(r, "redemption_refused")[0]["data"]["reason"], reason);
    };
    // Below the minimum.
    let r = env.redeem(&env.alice, ONE_A - 1, &old).await?;
    refused(&r, "BELOW_MIN");
    // Terms change: the old hash is refused.
    env.set_terms(3_600_000).await?;
    let r = env.redeem(&env.alice, 2 * ONE_A, &old).await?;
    refused(&r, "TERMS_CHANGED");
    // Not a hash at all.
    let r = env.convert(&env.alice, 2 * ONE_A, "redeem:nope").await?;
    refused(&r, "INVALID_MSG");
    assert_eq!(
        env.balance(&env.token_a, env.alice.id()).await?,
        10 * ONE_A,
        "every refusal returned the transfer"
    );
    assert_eq!(env.escrow().await?["escrowed_in"], "0");
    env.assert_conserved().await?;
    let fresh = env.terms_hash().await?;
    assert_ne!(fresh, old);
    let r = env.redeem(&env.alice, 2 * ONE_A, &fresh).await?;
    assert_eq!(events(&r, "redemption_requested").len(), 1);
    env.assert_conserved().await?;
    Ok(())
}
