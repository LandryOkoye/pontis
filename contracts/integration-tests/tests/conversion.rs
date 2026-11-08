mod common;

use common::*;

#[tokio::test]
async fn a_signed_quote_converts_a_to_b_with_the_contract_computed_amounts() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.fund_vault(&env.token_b, 1_000 * ONE_B).await?;
    env.mint(&env.token_a, env.alice.id(), 5 * ONE_A).await?;
    let before = env.inventory("tgold-b").await?;

    let amount_in = ONE_A;
    let (gross, fee, net) = Env::expected_a_to_b(amount_in);
    assert_eq!(
        (gross, fee, net),
        (1_000_000_000, 1_000_000, 999_000_000),
        "1 A is 10 B before a 10 bps fee"
    );

    let msg = env.signed_msg(&env.alice, amount_in, 60_000).await?;
    let result = env.convert(&env.alice, amount_in, &msg).await?;
    assert!(result.is_success(), "{:?}", result.failures());

    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 4 * ONE_A);
    assert_eq!(env.balance(&env.token_b, env.alice.id()).await?, net);
    assert_eq!(env.balance(&env.token_a, env.core.id()).await?, amount_in);
    assert_eq!(env.inventory("tgold-a").await?, amount_in);
    assert_eq!(env.inventory("tgold-b").await?, before - net);

    let completed = events(&result, "conversion_completed");
    assert_eq!(completed.len(), 1, "logs: {:?}", result.logs());
    let d = &completed[0]["data"];
    assert_eq!(d["amount_out"], net.to_string());
    assert_eq!(d["fee"], fee.to_string());
    assert_eq!(d["user"], env.alice.id().as_str());
    println!("GAS ft_transfer_call total: {}", result.total_gas_burnt);
    Ok(())
}

#[tokio::test]
async fn the_vault_balance_matches_the_token_balance_after_funding() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.fund_vault(&env.token_b, 7 * ONE_B).await?;
    assert_eq!(env.inventory("tgold-b").await?, 7 * ONE_B);
    assert_eq!(env.balance(&env.token_b, env.core.id()).await?, 7 * ONE_B);
    Ok(())
}
