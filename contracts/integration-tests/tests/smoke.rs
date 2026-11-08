mod common;

use common::*;

#[tokio::test]
async fn the_three_contracts_deploy_to_their_own_accounts() -> anyhow::Result<()> {
    let env = Env::new().await?;
    for (name, contract) in [
        ("core", &env.core),
        ("token a", &env.token_a),
        ("token b", &env.token_b),
    ] {
        let code = contract.view_code().await?;
        assert!(!code.is_empty(), "{name} has no code");
    }
    assert_ne!(env.token_a.id(), env.token_b.id());
    Ok(())
}

#[tokio::test]
async fn the_seeded_pair_is_an_executable_direct_equivalent_route() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let route: serde_json::Value = env
        .core
        .view("get_route")
        .args_json(serde_json::json!({"from_id": "tgold-a", "to_id": "tgold-b"}))
        .await?
        .json()?;
    assert_eq!(route["executable"], true, "{route}");
    assert_eq!(
        route["terms"]["ratio"],
        serde_json::json!({"num": "1000", "den": "1"})
    );
    assert_eq!(route["terms"]["compatibility_version"], 2);
    Ok(())
}
