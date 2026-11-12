//! The price guard scenario on a sandbox (ADR 0016): parity prices open a guarded pair, a deviating
//! price closes it and trips the breaker, a second approver resets it, the fee skew and the limits
//! apply at execution.

mod common;

use common::*;
use serde_json::{json, Value};

async fn reason_of(result: &near_workspaces::result::ExecutionFinalResult) -> String {
    let rejected = events(result, "conversion_rejected");
    assert_eq!(rejected.len(), 1, "logs: {:?}", result.logs());
    rejected[0]["data"]["reason"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn parity_prices_open_the_route_and_a_deviation_trips_the_breaker_until_a_second_approver_resets_it(
) -> anyhow::Result<()> {
    let env = funded().await?;
    // The owner proposed and approved the pair; bob is the second approver who may reset.
    env.admin(
        "grant_role",
        json!({"role": "compat_approver", "account_id": env.bob.id()}),
    )
    .await?
    .into_result()?;
    env.admin(
        "add_price_publisher_key",
        json!({"public_key": env.publisher_public_key()}),
    )
    .await?
    .into_result()?;
    let (before, _) = env.compat_version_and_status().await?;
    env.set_guard(json!({})).await?.into_result()?;
    assert_eq!(env.compat_version_and_status().await?.0, before + 1);
    let v = before + 1;

    // No price yet: a guarded pair fails closed.
    let route: Value = env
        .core
        .view("get_route")
        .args_json(json!({"from_id": "tgold-a", "to_id": "tgold-b"}))
        .await?
        .json()?;
    assert_eq!(route["refusal"], "price_missing");

    // Parity: 100 USD for A, 10 USD for B (1 A is 10 B).
    let t0 = env.now_ms().await? - 5_000;
    env.submit_prices(100, 10, t0).await?;
    let msg = env.signed_msg_with_fee(&env.alice, ONE_A, 10, v).await?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert!(result.is_success(), "{:?}", result.failures());
    assert_eq!(events(&result, "conversion_completed").len(), 1);

    // B at 10.50 is 4.76% below parity: closed, with the stated reason.
    let r = env
        .submit_price("tgold-b", 1_050_000_000, t0 + 1_000)
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let route: Value = env
        .core
        .view("get_route")
        .args_json(json!({"from_id": "tgold-a", "to_id": "tgold-b"}))
        .await?
        .json()?;
    assert_eq!(route["refusal"], "price_deviation");
    let guards: Value = env
        .core
        .view("get_route_guards")
        .args_json(
            json!({"from_id": "tgold-a", "to_id": "tgold-b", "amount_in": ONE_A.to_string()}),
        )
        .await?
        .json()?;
    assert_eq!(guards["executable"], false);

    // A refused conversion returns the whole input and counts toward the breaker: the price update
    // was the first violation, this is the second, the next the third.
    let before_inv = env.inventory("tgold-b").await?;
    let first = env
        .convert(
            &env.alice,
            ONE_A,
            &env.signed_msg_with_fee(&env.alice, ONE_A, 10, v).await?,
        )
        .await?;
    assert_eq!(reason_of(&first).await, "PRICE_DEVIATION");
    assert_eq!(env.inventory("tgold-b").await?, before_inv, "nothing moved");
    let second = env
        .convert(
            &env.alice,
            ONE_A,
            &env.signed_msg_with_fee(&env.alice, ONE_A, 10, v).await?,
        )
        .await?;
    assert_eq!(reason_of(&second).await, "PRICE_DEVIATION");
    assert_eq!(events(&second, "circuit_breaker_tripped").len(), 1);
    assert_eq!(
        env.compat_version_and_status().await?,
        (v + 1, "suspended".into())
    );

    // The proposer and approver cannot reset it; the second approver cannot while it deviates.
    let by_owner = env
        .call_as(&env.owner, "reset_circuit_breaker", json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b", "rationale": "x"}))
        .await?;
    assert!(by_owner.is_failure());
    let still = env
        .call_as(&env.bob, "reset_circuit_breaker", json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b", "rationale": "x"}))
        .await?;
    // (A host panic shows as a wasm trap in the sandbox, so the reason is covered by unit tests;
    // here the proof is that the state is unchanged and the same call works once prices recover.)
    assert!(still.is_failure());
    assert_eq!(
        env.compat_version_and_status().await?,
        (v + 1, "suspended".into())
    );

    // Prices recover, bob resets, quotes from before are void and a new one converts.
    env.submit_price("tgold-b", 10 * E8, t0 + 2_000)
        .await?
        .into_result()?;
    let reset = env
        .call_as(&env.bob, "reset_circuit_breaker", json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b", "rationale": "Prices recovered"}))
        .await?;
    assert!(reset.is_success(), "{:?}", reset.failures());
    assert_eq!(
        env.compat_version_and_status().await?,
        (v + 2, "approved".into())
    );
    let old = env
        .convert(
            &env.alice,
            ONE_A,
            &env.signed_msg_with_fee(&env.alice, ONE_A, 10, v).await?,
        )
        .await?;
    assert_eq!(reason_of(&old).await, "COMPATIBILITY_CHANGED");
    let fresh = env
        .convert(
            &env.alice,
            ONE_A,
            &env.signed_msg_with_fee(&env.alice, ONE_A, 10, v + 2)
                .await?,
        )
        .await?;
    assert!(fresh.is_success() && events(&fresh, "conversion_completed").len() == 1);
    Ok(())
}

#[tokio::test]
async fn the_skew_fee_rises_as_the_vault_drains_and_limits_refuse_with_their_own_reasons(
) -> anyhow::Result<()> {
    let env = funded().await?;
    env.admin(
        "add_price_publisher_key",
        json!({"public_key": env.publisher_public_key()}),
    )
    .await?
    .into_result()?;
    let t0 = env.now_ms().await? - 5_000;
    env.submit_prices(100, 10, t0).await?;
    env.set_guard(
        json!({"skew_max_bps": 100, "min_amount_in": "100000", "max_amount_in": "40000000"}),
    )
    .await?
    .into_result()?;
    let (v, _) = env.compat_version_and_status().await?;
    env.mint(&env.token_a, env.alice.id(), 80 * ONE_A).await?;

    // The effective fee for a conversion that takes a tenth of the vault, computed independently:
    // reference = peak inventory, depletion = reference - inventory after payout, skew quadratic.
    let reference = env.inventory("tgold-b").await?;
    let amount = 10 * ONE_A;
    let gross = amount * RATIO_A_TO_B;
    let base_net = gross - (gross * 10).div_ceil(10_000);
    let after = reference - base_net;
    let depletion = reference - after;
    let skew = (100 * depletion * depletion).div_ceil(reference * reference);
    let expected_fee_bps = 10 + skew as u16;
    assert!(skew >= 1, "the scenario must exercise the skew");
    let guards: Value = env
        .core
        .view("get_route_guards")
        .args_json(
            json!({"from_id": "tgold-a", "to_id": "tgold-b", "amount_in": amount.to_string()}),
        )
        .await?
        .json()?;
    assert_eq!(guards["fee_bps"], expected_fee_bps);

    // The old fee no longer matches; the skewed one converts and pays out accordingly.
    let narrow = env
        .convert(
            &env.alice,
            amount,
            &env.signed_msg_with_fee(&env.alice, amount, 10, v).await?,
        )
        .await?;
    assert_eq!(reason_of(&narrow).await, "FEE_CHANGED");
    let wide = env
        .convert(
            &env.alice,
            amount,
            &env.signed_msg_with_fee(&env.alice, amount, expected_fee_bps, v)
                .await?,
        )
        .await?;
    assert!(wide.is_success(), "{:?}", wide.failures());
    let completed = events(&wide, "conversion_completed");
    assert_eq!(completed[0]["data"]["fee_bps"], expected_fee_bps);

    // Limits.
    for (amount, reason) in [
        (99_999u128, "AMOUNT_BELOW_MIN"),
        (40_000_001, "AMOUNT_ABOVE_MAX"),
    ] {
        // The fee still carries the skew the vault's depletion earns; the limit is checked after it.
        let guards: Value = env
            .core
            .view("get_route_guards")
            .args_json(
                json!({"from_id": "tgold-a", "to_id": "tgold-b", "amount_in": amount.to_string()}),
            )
            .await?
            .json()?;
        let fee = guards["fee_bps"].as_u64().unwrap() as u16;
        let msg = env.signed_msg_with_fee(&env.alice, amount, fee, v).await?;
        let r = env.convert(&env.alice, amount, &msg).await?;
        assert_eq!(reason_of(&r).await, reason, "amount {amount}");
    }
    Ok(())
}

#[tokio::test]
async fn an_unguarded_pair_ignores_prices_and_behaves_as_the_mvp() -> anyhow::Result<()> {
    let env = funded().await?;
    env.admin(
        "add_price_publisher_key",
        json!({"public_key": env.publisher_public_key()}),
    )
    .await?
    .into_result()?;
    let t0 = env.now_ms().await? - 5_000;
    env.submit_prices(100, 11, t0).await?; // far from parity, but no guard is set
    let msg = env.signed_msg(&env.alice, ONE_A, 60_000).await?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert!(result.is_success() && events(&result, "conversion_completed").len() == 1);
    Ok(())
}
