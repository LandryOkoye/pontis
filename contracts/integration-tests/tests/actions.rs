//! Corporate actions, lifecycle and NAV strikes on a sandbox with the real contracts (ADR 0017 and
//! 0018). Times are the sandbox clock: a block is about 0.3 s, so windows of a minute are cheap to
//! cross with `fast_forward`. A host panic shows as a wasm trap here, so refusal wording is covered
//! by unit tests; these tests assert states, route refusals and conversion reject reasons.

mod common;

use common::*;
use serde_json::{json, Value};

async fn reason_of(result: &near_workspaces::result::ExecutionFinalResult) -> String {
    let rejected = events(result, "conversion_rejected");
    assert_eq!(rejected.len(), 1, "logs: {:?}", result.logs());
    rejected[0]["data"]["reason"].as_str().unwrap().to_string()
}

/// A quote at an explicit version for 1 A, valid for ten minutes, and the conversion's result.
async fn refused_with(env: &Env, version: u64) -> anyhow::Result<String> {
    let msg = env
        .signed_msg_with_fee(&env.alice, ONE_A, 10, version)
        .await?;
    let before = env.balance(&env.token_a, env.alice.id()).await?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert!(result.is_success(), "{:?}", result.failures());
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, before);
    Ok(reason_of(&result).await)
}

async fn converts(env: &Env) -> anyhow::Result<()> {
    let msg = env.signed_msg(&env.alice, ONE_A, 600_000).await?;
    let result = env.convert(&env.alice, ONE_A, &msg).await?;
    assert!(result.is_success(), "{:?}", result.failures());
    assert_eq!(events(&result, "conversion_completed").len(), 1);
    Ok(())
}

#[tokio::test]
async fn a_split_closes_the_pair_until_both_wrappers_apply_it_and_voids_old_quotes(
) -> anyhow::Result<()> {
    let env = funded().await?;
    env.with_second_approver_and_publisher().await?;
    let (v, _) = env.compat_version_and_status().await?;
    let t0 = env.now_ms().await?;
    let (from, effective, until) = (t0 + 60_000, t0 + 120_000, t0 + 180_000);
    let id = env.schedule_split(from, effective, until).await?;
    assert_eq!(id, "syn-gold-oz-1");

    // Before the window the pair routes and the view says when the freeze starts.
    let route = env.route().await?;
    assert_eq!(route["executable"], true);
    assert_eq!(route["next_freeze_ms"], from);
    let old_quote = env.signed_msg(&env.alice, ONE_A, 600_000).await?;

    // In the freeze window the pair is unroutable, and a conversion is refused in full.
    env.advance_to(t0 + 90_000).await?;
    assert_eq!(env.refusal().await?, "corporate_action_freeze");
    assert_eq!(refused_with(&env, v).await?, "CORPORATE_ACTION_FREEZE");

    // After the effective time one wrapper applies; the epochs disagree, so the pair stays shut.
    env.advance_to(effective + 5_000).await?;
    let first = env.apply_split(&id, "tgold-a").await?;
    assert!(first.is_success(), "{:?}", first.failures());
    assert_eq!(events(&first, "multiplier_epoch_added").len(), 1);
    env.advance_to(until + 5_000).await?;
    assert_eq!(env.refusal().await?, "corporate_action_pending");
    assert_eq!(refused_with(&env, v + 1).await?, "CORPORATE_ACTION_PENDING");
    let epochs = env
        .core_view(
            "get_multiplier_epochs",
            json!({"representation_id": "tgold-a"}),
        )
        .await?;
    assert_eq!(epochs.as_array().unwrap().len(), 2);
    assert_eq!(
        epochs[1]["multiplier"],
        json!({"num": "1", "den": "2000000"})
    );
    assert_eq!(epochs[1]["action_id"], id);

    // The wrong factor is refused and changes nothing; the exact one completes the action.
    let wrong = env
        .admin(
            "apply_corporate_action",
            json!({"action_id": id, "representation_id": "tgold-b",
            "new_multiplier": {"num": "1", "den": "3000000000"}}),
        )
        .await?;
    assert!(wrong.is_failure());
    let b_epochs = env
        .core_view(
            "get_multiplier_epochs",
            json!({"representation_id": "tgold-b"}),
        )
        .await?;
    assert_eq!(b_epochs.as_array().unwrap().len(), 1);
    let second = env.apply_split(&id, "tgold-b").await?;
    assert!(second.is_success(), "{:?}", second.failures());
    let applied = events(&second, "corporate_action_applied");
    assert_eq!(applied.last().unwrap()["data"]["complete"], true);
    let actions = env
        .core_view("get_corporate_actions", json!({"asset_id": "syn-gold-oz"}))
        .await?;
    assert_eq!(actions[0]["status"], "applied");

    // Both applied: routable at the same ratio, a new version, and the old quote is void.
    let route = env.route().await?;
    assert_eq!(route["executable"], true, "{route}");
    assert_eq!(route["terms"]["ratio"], json!({"num": "1000", "den": "1"}));
    assert_eq!(route["terms"]["compatibility_version"], v + 2);
    let old = env.convert(&env.alice, ONE_A, &old_quote).await?;
    assert_eq!(reason_of(&old).await, "COMPATIBILITY_CHANGED");
    assert_eq!(env.balance(&env.token_a, env.alice.id()).await?, 5 * ONE_A);
    converts(&env).await
}

#[tokio::test]
async fn a_nav_fund_converts_only_inside_an_open_strike_window() -> anyhow::Result<()> {
    let env = funded().await?;
    env.with_second_approver_and_publisher().await?;
    env.set_flags("tgold-b", "nav_fund", false)
        .await?
        .into_result()?;
    let (v, _) = env.compat_version_and_status().await?;

    // No strike yet: closed.
    assert_eq!(env.refusal().await?, "nav_window_closed");
    assert_eq!(refused_with(&env, v).await?, "NAV_WINDOW_CLOSED");

    // A signed strike opens the window [as_of, cutoff) and carries its labels.
    let t = env.now_ms().await?;
    let strike = env.submit_nav("tgold-b", 10 * E8, t, t + 60_000).await?;
    assert!(strike.is_success(), "{:?}", strike.failures());
    let posted = events(&strike, "nav_strike_posted");
    assert_eq!(posted[0]["data"]["simulated"], true);
    assert_eq!(posted[0]["data"]["source"], "simulated_fund_admin");
    converts(&env).await?;

    // At the cutoff the window is shut again until the next strike.
    env.advance_to(t + 61_000).await?;
    assert_eq!(env.refusal().await?, "nav_window_closed");
    assert_eq!(refused_with(&env, v).await?, "NAV_WINDOW_CLOSED");
    let next = env.now_ms().await?;
    env.submit_nav("tgold-b", 10 * E8, next, next + 60_000)
        .await?
        .into_result()?;
    assert_eq!(env.route().await?["executable"], true);
    converts(&env).await
}

#[tokio::test]
async fn no_conversion_and_delisted_assets_are_refused_and_an_unconfigured_one_behaves_as_the_mvp(
) -> anyhow::Result<()> {
    let env = funded().await?;
    env.with_second_approver_and_publisher().await?;
    // Nothing configured: the MVP behaviour, and the default lifecycle is fungible and active.
    converts(&env).await?;
    let life = env
        .core_view("get_lifecycle", json!({"representation_id": "tgold-a"}))
        .await?;
    assert_eq!(
        (life["kind"].clone(), life["stage"].clone()),
        (json!("fungible"), json!("active"))
    );

    // no_conversion refuses; clearing it reopens at a new version.
    env.set_flags("tgold-a", "unique", true)
        .await?
        .into_result()?;
    let (v, _) = env.compat_version_and_status().await?;
    assert_eq!(env.refusal().await?, "not_convertible");
    assert_eq!(refused_with(&env, v).await?, "NOT_CONVERTIBLE");
    env.set_flags("tgold-a", "fungible", false)
        .await?
        .into_result()?;
    assert_eq!(env.route().await?["executable"], true);

    // Delisting takes a registrar's request and a different approver.
    env.admin(
        "request_delist",
        json!({"representation_id": "tgold-b", "evidence_hash": null, "note": "Issuer left"}),
    )
    .await?
    .into_result()?;
    assert_eq!(
        env.route().await?["executable"],
        true,
        "a request alone changes nothing"
    );
    let same = env
        .admin("approve_delist", json!({"representation_id": "tgold-b"}))
        .await?;
    assert!(same.is_failure(), "the requester cannot approve");
    let approved = env
        .call_as(
            &env.bob,
            "approve_delist",
            json!({"representation_id": "tgold-b"}),
        )
        .await?;
    assert!(approved.is_success(), "{:?}", approved.failures());
    assert_eq!(
        events(&approved, "lifecycle_stage_changed")[0]["data"]["to"],
        "delisted"
    );
    let (v, _) = env.compat_version_and_status().await?;
    assert_eq!(env.refusal().await?, "lifecycle_blocked");
    assert_eq!(refused_with(&env, v).await?, "LIFECYCLE_BLOCKED");
    let life = env
        .core_view("get_lifecycle", json!({"representation_id": "tgold-b"}))
        .await?;
    assert_eq!(life["history"].as_array().unwrap().len(), 1);
    assert_eq!(life["history"][0]["by"], env.bob.id().as_str());
    let guards: Value = env
        .core_view(
            "get_route_guards",
            json!({"from_id": "tgold-a", "to_id": "tgold-b", "amount_in": null}),
        )
        .await?;
    let blocked = guards["checks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "lifecycle_blocked" && c["passed"] == false);
    assert!(blocked.is_some(), "{guards}");
    Ok(())
}
