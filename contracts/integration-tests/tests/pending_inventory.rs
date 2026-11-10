//! A conversion's input must not be spendable until its payout has succeeded.
//!
//! The destination token is the `mock-payout-token` fixture: it keeps the payout unresolved until
//! the test releases it, so each test acts in the exact interval where the input is held and the
//! payout is pending, then resolves the payout and follows the real `on_payout_resolved` and
//! `ft_resolve_transfer` chain on the real TGOLD-A token. Before the fix, inventory counted the
//! input immediately, so the withdrawal and the reverse conversion below consumed it and the
//! refund came back short.

mod common;

use common::*;
use near_workspaces::Account;

const NET_OUT: u128 = 999_000_000;

/// Alice and Bob hold 5 A each, the B vault holds 1,000 B, and B payouts are held.
async fn env() -> anyhow::Result<Env> {
    let env = Env::with_held_payouts().await?;
    env.fund_vault(&env.token_b, 1_000 * ONE_B).await?;
    for who in [env.alice.id(), env.bob.id()] {
        env.mint(&env.token_a, who, 5 * ONE_A).await?;
    }
    Ok(env)
}

/// Nothing of the conversion is left over: balances, inventory and pending all at the baseline.
async fn assert_baseline(env: &Env, who: &Account) -> anyhow::Result<()> {
    assert_eq!(
        env.balance(&env.token_a, who.id()).await?,
        5 * ONE_A,
        "the whole input came back"
    );
    assert_eq!(env.balance(&env.token_a, env.core.id()).await?, 0);
    assert_eq!(env.inventory("tgold-a").await?, 0);
    assert_eq!(env.inventory("tgold-b").await?, 1_000 * ONE_B);
    assert_eq!(env.pending_inbound("tgold-a").await?, 0);
    Ok(())
}

#[tokio::test]
async fn a_withdrawal_cannot_take_an_input_whose_payout_is_pending_and_a_failed_payout_refunds_in_full(
) -> anyhow::Result<()> {
    let env = env().await?;
    let msg = env.signed_msg(&env.alice, ONE_A, 600_000).await?;
    let tx = env.start_conversion(&env.alice, ONE_A, &msg).await?;
    env.wait_for_held_payout(env.alice.id()).await?;

    // The input is held by core and counted as pending, not as inventory; the output is reserved.
    assert_eq!(env.balance(&env.token_a, env.core.id()).await?, ONE_A);
    assert_eq!(env.pending_inbound("tgold-a").await?, ONE_A);
    assert_eq!(env.inventory("tgold-a").await?, 0);
    assert_eq!(env.inventory("tgold-b").await?, 1_000 * ONE_B - NET_OUT);

    let attempt = env.withdraw("tgold-a", ONE_A).await?;
    assert!(
        attempt.is_failure(),
        "the pending input was withdrawn: {:?}",
        attempt.logs()
    );
    assert_eq!(env.balance(&env.token_a, env.core.id()).await?, ONE_A);

    env.release_payout(env.alice.id(), false).await?;
    let result = env.finish(&tx).await?;
    assert!(result.is_success(), "{:?}", result.failures());
    let failed = events(&result, "conversion_failed");
    assert_eq!(failed.len(), 1, "logs: {:?}", result.logs());
    assert_eq!(failed[0]["data"]["reason"], "PAYOUT_FAILED");
    assert_baseline(&env, &env.alice).await
}

#[tokio::test]
async fn a_withdrawal_while_a_payout_is_pending_takes_only_genuine_inventory() -> anyhow::Result<()>
{
    let env = env().await?;
    let funded_a = ONE_A * 4 / 10;
    env.fund_vault(&env.token_a, funded_a).await?;

    let msg = env.signed_msg(&env.alice, ONE_A, 600_000).await?;
    let tx = env.start_conversion(&env.alice, ONE_A, &msg).await?;
    env.wait_for_held_payout(env.alice.id()).await?;
    assert_eq!(env.inventory("tgold-a").await?, funded_a);
    assert_eq!(env.pending_inbound("tgold-a").await?, ONE_A);

    // Funded inventory plus the pending input is more than the funded inventory.
    let too_much = env.withdraw("tgold-a", funded_a + 1).await?;
    assert!(too_much.is_failure(), "{:?}", too_much.logs());
    let own = env.withdraw("tgold-a", funded_a).await?;
    assert!(own.is_success(), "{:?}", own.failures());
    assert_eq!(env.inventory("tgold-a").await?, 0);
    assert_eq!(env.balance(&env.token_a, env.core.id()).await?, ONE_A);

    env.release_payout(env.alice.id(), false).await?;
    let result = env.finish(&tx).await?;
    assert!(result.is_success(), "{:?}", result.failures());
    assert_baseline(&env, &env.alice).await
}

#[tokio::test]
async fn a_reverse_conversion_cannot_spend_an_input_whose_payout_is_pending() -> anyhow::Result<()>
{
    let env = env().await?;
    let msg = env.signed_msg(&env.alice, ONE_A, 600_000).await?;
    let tx = env.start_conversion(&env.alice, ONE_A, &msg).await?;
    env.wait_for_held_payout(env.alice.id()).await?;

    // Bob converts 10 B back to A: the 999,000 A it pays would fit inside Alice's pending 1 A.
    let amount_b = 10 * ONE_B;
    let (_, _, net_a) = Env::expected_b_to_a(amount_b);
    assert!(
        net_a <= ONE_A,
        "the reverse output would fit in the held input"
    );
    let reverse = env
        .signed_msg_for(&env.bob, false, amount_b, 600_000)
        .await?;
    let attempt = env.convert_from_b(&env.bob, amount_b, &reverse).await?;
    let rejected = events(&attempt, "conversion_rejected");
    assert_eq!(rejected.len(), 1, "logs: {:?}", attempt.logs());
    assert_eq!(rejected[0]["data"]["reason"], "INSUFFICIENT_INVENTORY");
    assert!(events(&attempt, "conversion_completed").is_empty());
    assert_eq!(env.balance(&env.token_a, env.bob.id()).await?, 5 * ONE_A);
    assert_eq!(env.balance(&env.token_a, env.core.id()).await?, ONE_A);
    assert_eq!(env.pending_inbound("tgold-a").await?, ONE_A);

    env.release_payout(env.alice.id(), false).await?;
    let result = env.finish(&tx).await?;
    assert!(result.is_success(), "{:?}", result.failures());
    assert_baseline(&env, &env.alice).await?;
    assert_eq!(env.balance(&env.token_a, env.bob.id()).await?, 5 * ONE_A);
    Ok(())
}

#[tokio::test]
async fn a_settled_input_becomes_spendable_inventory() -> anyhow::Result<()> {
    let env = env().await?;
    let msg = env.signed_msg(&env.alice, ONE_A, 600_000).await?;
    let tx = env.start_conversion(&env.alice, ONE_A, &msg).await?;
    env.wait_for_held_payout(env.alice.id()).await?;
    assert_eq!(env.inventory("tgold-a").await?, 0);

    env.release_payout(env.alice.id(), true).await?;
    let result = env.finish(&tx).await?;
    assert!(result.is_success(), "{:?}", result.failures());
    let completed = events(&result, "conversion_completed");
    assert_eq!(completed.len(), 1, "logs: {:?}", result.logs());
    assert_eq!(completed[0]["data"]["amount_out"], NET_OUT.to_string());
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 4 * ONE_A);
    assert_eq!(env.inventory("tgold-a").await?, ONE_A);
    assert_eq!(env.pending_inbound("tgold-a").await?, 0);
    assert_eq!(env.inventory("tgold-b").await?, 1_000 * ONE_B - NET_OUT);

    // Now settled, the A is real inventory: a reverse conversion can spend it, and so can a withdrawal.
    let amount_b = 10 * ONE_B;
    let (_, _, net_a) = Env::expected_b_to_a(amount_b);
    let reverse = env
        .signed_msg_for(&env.bob, false, amount_b, 600_000)
        .await?;
    let back = env.convert_from_b(&env.bob, amount_b, &reverse).await?;
    assert!(back.is_success(), "{:?}", back.failures());
    assert_eq!(
        events(&back, "conversion_rejected").len(),
        0,
        "{:?}",
        back.logs()
    );
    assert_eq!(
        env.balance(&env.token_a, env.bob.id()).await?,
        5 * ONE_A + net_a
    );
    Ok(())
}

#[tokio::test]
async fn several_conversions_in_flight_settle_independently() -> anyhow::Result<()> {
    let env = env().await?;
    let alice_msg = env.signed_msg(&env.alice, ONE_A, 600_000).await?;
    let bob_msg = env.signed_msg(&env.bob, 2 * ONE_A, 600_000).await?;
    let alice_tx = env.start_conversion(&env.alice, ONE_A, &alice_msg).await?;
    let bob_tx = env.start_conversion(&env.bob, 2 * ONE_A, &bob_msg).await?;
    env.wait_for_held_payout(env.alice.id()).await?;
    env.wait_for_held_payout(env.bob.id()).await?;

    let (_, _, bob_net) = Env::expected_a_to_b(2 * ONE_A);
    assert_eq!(env.pending_inbound("tgold-a").await?, 3 * ONE_A);
    assert_eq!(env.inventory("tgold-a").await?, 0);
    assert_eq!(
        env.inventory("tgold-b").await?,
        1_000 * ONE_B - NET_OUT - bob_net
    );
    assert!(env.withdraw("tgold-a", 1).await?.is_failure());

    // Alice's payout succeeds and Bob's fails, in the opposite order to how they started.
    env.release_payout(env.bob.id(), false).await?;
    let bob_result = env.finish(&bob_tx).await?;
    assert_eq!(events(&bob_result, "conversion_failed").len(), 1);
    assert_eq!(
        env.pending_inbound("tgold-a").await?,
        ONE_A,
        "Alice's is still pending"
    );
    assert_eq!(
        env.inventory("tgold-a").await?,
        0,
        "Bob's refund never became inventory"
    );
    assert_eq!(env.balance(&env.token_a, env.bob.id()).await?, 5 * ONE_A);

    env.release_payout(env.alice.id(), true).await?;
    let alice_result = env.finish(&alice_tx).await?;
    assert_eq!(events(&alice_result, "conversion_completed").len(), 1);
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 4 * ONE_A);
    assert_eq!(env.inventory("tgold-a").await?, ONE_A);
    assert_eq!(env.pending_inbound("tgold-a").await?, 0);
    assert_eq!(env.inventory("tgold-b").await?, 1_000 * ONE_B - NET_OUT);
    assert_eq!(
        env.balance(&env.token_a, env.core.id()).await?,
        ONE_A,
        "core holds exactly the inventory it records"
    );
    let drain = env.withdraw("tgold-a", ONE_A).await?;
    assert!(drain.is_success(), "{:?}", drain.failures());
    Ok(())
}
