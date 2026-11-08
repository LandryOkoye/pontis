mod common;

use common::*;
use serde_json::{json, Value};

#[tokio::test]
async fn a_failed_payout_refunds_the_input_and_the_quote_cannot_be_replayed() -> anyhow::Result<()>
{
    let env = funded().await?;
    // carol is registered on A but not on B, so `ft_transfer` of the output to her fails.
    let msg = env.signed_msg(&env.carol, ONE_A, 60_000).await?;
    let result = env.convert(&env.carol, ONE_A, &msg).await?;
    assert!(result.is_success(), "{:?}", result.failures());

    let failed = events(&result, "conversion_failed");
    assert_eq!(failed.len(), 1, "logs: {:?}", result.logs());
    assert_eq!(failed[0]["data"]["reason"], "PAYOUT_FAILED");
    assert!(events(&result, "conversion_completed").is_empty());
    assert_eq!(
        env.balance(&env.token_a, env.carol.id()).await?,
        5 * ONE_A,
        "input refunded"
    );
    assert_eq!(env.balance(&env.token_b, env.carol.id()).await?, 0);
    assert_eq!(
        (
            env.inventory("tgold-a").await?,
            env.inventory("tgold-b").await?
        ),
        (0, 1_000 * ONE_B)
    );
    assert_eq!(
        env.balance(&env.token_a, env.core.id()).await?,
        0,
        "core keeps none of the input"
    );

    // Registering carol does not revive the quote: the nonce stays used.
    env.register(&env.token_b, env.carol.id()).await?;
    let replay = env.convert(&env.carol, ONE_A, &msg).await?;
    assert_eq!(
        events(&replay, "conversion_rejected")[0]["data"]["reason"],
        "NONCE_USED"
    );
    assert_eq!(env.balance(&env.token_b, env.carol.id()).await?, 0);
    Ok(())
}

#[tokio::test]
async fn an_expired_quote_is_refunded() -> anyhow::Result<()> {
    let env = funded().await?;
    let msg = env.signed_msg(&env.alice, ONE_A, -1_000).await?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert_refunded(&env, &result, "alice", "QUOTE_EXPIRED").await
}

#[tokio::test]
async fn another_account_cannot_use_a_quote_it_was_not_issued() -> anyhow::Result<()> {
    let env = funded().await?;
    let msg = env.signed_msg(&env.alice, ONE_A, 60_000).await?;
    let result = env.convert(&env.bob, ONE_A, &msg).await?;
    assert_refunded(&env, &result, "bob", "WRONG_SENDER").await
}

#[tokio::test]
async fn an_altered_quote_is_refunded() -> anyhow::Result<()> {
    let env = funded().await?;
    let mut msg: Value = serde_json::from_str(&env.signed_msg(&env.alice, ONE_A, 60_000).await?)?;
    msg["quote"]["amount_out"] = json!((2_000 * ONE_B / 1000).to_string()); // more than the ratio allows
    let result = env.convert(&env.alice, ONE_A, &msg.to_string()).await?;
    assert_refunded(&env, &result, "alice", "BAD_SIGNATURE").await
}
