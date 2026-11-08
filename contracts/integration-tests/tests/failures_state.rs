//! Refusals driven by contract state after a quote was issued: each returns the whole input.

mod common;

use common::*;
use serde_json::json;

#[tokio::test]
async fn a_suspended_relationship_blocks_a_quote_issued_before_the_suspension() -> anyhow::Result<()>
{
    let env = funded().await?;
    let msg = env.signed_msg(&env.alice, ONE_A, 60_000).await?;
    env.admin(
        "suspend_compatibility",
        json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b",
        "rationale": "Evidence is stale"}),
    )
    .await?
    .into_result()?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert_refunded(&env, &result, "alice", "RELATIONSHIP_SUSPENDED").await
}

#[tokio::test]
async fn a_globally_paused_contract_refuses_conversions() -> anyhow::Result<()> {
    let env = funded().await?;
    let msg = env.signed_msg(&env.alice, ONE_A, 60_000).await?;
    env.admin("pause", json!({})).await?.into_result()?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert_refunded(&env, &result, "alice", "ASSET_PAUSED").await
}

#[tokio::test]
async fn an_account_removed_from_the_allowlist_is_refused() -> anyhow::Result<()> {
    let env = funded().await?;
    let msg = env.signed_msg(&env.alice, ONE_A, 60_000).await?;
    env.admin(
        "set_allowlist",
        json!({"representation_id": "tgold-b", "account_ids": [env.alice.id()], "allowed": false}),
    )
    .await?
    .into_result()?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert_refunded(&env, &result, "alice", "NOT_ELIGIBLE").await
}

#[tokio::test]
async fn an_empty_vault_refuses_with_insufficient_inventory() -> anyhow::Result<()> {
    let env = funded().await?;
    env.admin(
        "withdraw_inventory",
        json!({"representation_id": "tgold-b", "amount": (1_000 * ONE_B).to_string(),
        "receiver_id": env.owner.id()}),
    )
    .await?
    .into_result()?;
    assert_eq!(env.inventory("tgold-b").await?, 0);
    let msg = env.signed_msg(&env.alice, ONE_A, 60_000).await?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert!(
        events(&result, "conversion_rejected")[0]["data"]["reason"] == "INSUFFICIENT_INVENTORY"
    );
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 5 * ONE_A);
    Ok(())
}

#[tokio::test]
async fn only_the_owner_can_fund_the_vault() -> anyhow::Result<()> {
    let env = funded().await?;
    let result = env
        .alice
        .call(env.token_a.id(), "ft_transfer_call")
        .args_json(
            json!({"receiver_id": env.core.id(), "amount": ONE_A.to_string(), "msg": "fund_vault"}),
        )
        .deposit(yocto(1))
        .max_gas()
        .transact()
        .await?;
    assert_eq!(
        events(&result, "conversion_rejected")[0]["data"]["reason"],
        "NOT_OWNER"
    );
    assert_eq!(
        env.balance(&env.token_a, env.alice.id()).await?,
        5 * ONE_A,
        "refunded"
    );
    assert_eq!(env.inventory("tgold-a").await?, 0);
    Ok(())
}

#[tokio::test]
async fn calling_ft_on_transfer_directly_credits_nothing() -> anyhow::Result<()> {
    let env = funded().await?;
    let result = env
        .alice
        .call(env.core.id(), "ft_on_transfer")
        .args_json(json!({"sender_id": env.owner.id(), "amount": "1000", "msg": "fund_vault"}))
        .max_gas()
        .transact()
        .await?;
    assert_eq!(
        events(&result, "conversion_rejected")[0]["data"]["reason"],
        "UNKNOWN_TOKEN"
    );
    assert_eq!(env.inventory("tgold-a").await?, 0);
    Ok(())
}
