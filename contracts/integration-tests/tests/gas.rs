//! Gas budget of a conversion `ft_transfer_call` (ADR 0007): which prepaid gas completes the
//! whole chain (transfer, `ft_on_transfer`, payout, callback, `ft_resolve_transfer`), and what
//! each receipt burns. The wallet plan returned by `POST /v1/conversions` (B11) uses `WALLET_GAS`.

mod common;

use common::*;
use near_workspaces::types::Gas;
use serde_json::json;

/// What the API puts on the `ft_transfer_call` action.
const WALLET_GAS: u64 = 100_000_000_000_000;

async fn attempt(env: &Env, gas_tgas: u64, ttl: i64) -> anyhow::Result<(bool, Vec<(String, u64)>)> {
    let msg = env.signed_msg(&env.alice, ONE_A, ttl).await?;
    let result = env
        .alice
        .call(env.token_a.id(), "ft_transfer_call")
        .args_json(json!({"receiver_id": env.core.id(), "amount": ONE_A.to_string(), "msg": msg}))
        .deposit(yocto(1))
        .gas(Gas::from_tgas(gas_tgas))
        .transact()
        .await?;
    let per_receipt = result
        .receipt_outcomes()
        .iter()
        .map(|o| {
            (
                o.executor_id.to_string(),
                o.gas_burnt.as_gas() / 1_000_000_000_000,
            )
        })
        .collect();
    Ok((
        !events(&result, "conversion_completed").is_empty(),
        per_receipt,
    ))
}

#[tokio::test]
async fn the_wallet_gas_completes_a_conversion_and_too_little_gas_never_loses_funds(
) -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.fund_vault(&env.token_b, 1_000 * ONE_B).await?;
    env.mint(&env.token_a, env.alice.id(), 50 * ONE_A).await?;
    let mut expected_a = 50 * ONE_A;
    for tgas in [25, 33, 40, 60, WALLET_GAS / 1_000_000_000_000] {
        let (completed, receipts) = attempt(&env, tgas, 60_000).await?;
        println!("GAS prepaid {tgas} Tgas -> completed {completed}; burnt per receipt (Tgas): {receipts:?}");
        if completed {
            expected_a -= ONE_A;
        }
        // Whatever the gas, the input is either converted or returned, never lost.
        assert_eq!(
            env.balance(&env.token_a, env.alice.id()).await?,
            expected_a,
            "at {tgas} Tgas"
        );
        assert_eq!(
            env.balance(&env.token_a, env.core.id()).await?,
            50 * ONE_A - expected_a,
            "at {tgas} Tgas"
        );
    }
    assert!(
        expected_a < 50 * ONE_A,
        "the conversion must complete with the gas the wallet plan attaches"
    );
    let (completed, _) = attempt(&env, WALLET_GAS / 1_000_000_000_000, 60_000).await?;
    assert!(completed);
    Ok(())
}
