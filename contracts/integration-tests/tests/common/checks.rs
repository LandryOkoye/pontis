//! Assertions shared by the failure-path tests.

use super::*;

/// Alice has 5 A, the B vault holds 1,000 B, and a baseline of balances to compare against.
pub async fn funded() -> anyhow::Result<Env> {
    let env = Env::new().await?;
    env.fund_vault(&env.token_b, 1_000 * ONE_B).await?;
    for who in [env.alice.id(), env.bob.id(), env.carol.id()] {
        env.mint(&env.token_a, who, 5 * ONE_A).await?;
    }
    Ok(env)
}

/// The whole input came back and nothing moved: balances and inventory equal the baseline.
pub async fn assert_refunded(
    env: &Env,
    result: &ExecutionFinalResult,
    who: &str,
    reason: &str,
) -> anyhow::Result<()> {
    assert!(
        result.is_success(),
        "the transfer call itself must not fail: {:?}",
        result.failures()
    );
    let rejected = events(result, "conversion_rejected");
    assert_eq!(rejected.len(), 1, "logs: {:?}", result.logs());
    assert_eq!(rejected[0]["data"]["reason"], reason);
    let account = match who {
        "alice" => env.alice.id(),
        "bob" => env.bob.id(),
        _ => env.carol.id(),
    };
    assert_eq!(
        env.balance(&env.token_a, account).await?,
        5 * ONE_A,
        "input refunded in full"
    );
    assert_eq!(env.balance(&env.token_b, account).await?, 0);
    assert_eq!(env.balance(&env.token_a, env.core.id()).await?, 0);
    assert_eq!(env.inventory("tgold-a").await?, 0);
    assert_eq!(env.inventory("tgold-b").await?, 1_000 * ONE_B);
    Ok(())
}
