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
