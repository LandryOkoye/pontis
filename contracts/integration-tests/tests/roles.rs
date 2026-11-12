//! The role registry on a sandbox (ADR 0019 section 2): attester roles, the separation rule, the
//! signer key registry and `get_account_roles`. A refused call is a wasm trap here, so refusals
//! are asserted through state.

mod common;

use common::*;
use ed25519_dalek::SigningKey;
use serde_json::{json, Value};

fn public_key(seed_byte: u8) -> String {
    near_workspaces::types::PublicKey::try_from_parts(
        near_workspaces::types::KeyType::ED25519,
        &SigningKey::from_bytes(&[seed_byte; 32])
            .verifying_key()
            .to_bytes(),
    )
    .unwrap()
    .to_string()
}

async fn roles_of(env: &Env, account: &str) -> anyhow::Result<Vec<String>> {
    Ok(env
        .core
        .view("get_account_roles")
        .args_json(json!({"account_id": account}))
        .await?
        .json()?)
}

async fn keys(env: &Env, role: &str) -> anyhow::Result<Vec<Value>> {
    Ok(env
        .core
        .view("get_signer_keys")
        .args_json(json!({"role": role}))
        .await?
        .json()?)
}

#[tokio::test]
async fn a_registrar_cannot_be_an_attester_and_the_owner_is_listed_first() -> anyhow::Result<()> {
    let env = Env::new().await?;
    // The seeded owner holds the three original roles and is listed first.
    assert_eq!(
        roles_of(&env, env.owner.id().as_str()).await?,
        vec!["owner", "registrar", "compat_approver", "pauser"]
    );
    env.admin(
        "grant_role",
        json!({"role": "reserve_attester", "account_id": env.alice.id()}),
    )
    .await?
    .into_result()?;
    // Alice is an attester, so the registrar grant fails and she stays attester only.
    let refused = env
        .admin(
            "grant_role",
            json!({"role": "registrar", "account_id": env.alice.id()}),
        )
        .await?;
    assert!(refused.is_failure());
    assert_eq!(
        roles_of(&env, env.alice.id().as_str()).await?,
        vec!["reserve_attester"]
    );
    // The owner is a registrar, so the owner cannot take an attester role either.
    let refused = env
        .admin(
            "grant_role",
            json!({"role": "bridge_attester", "account_id": env.owner.id()}),
        )
        .await?;
    assert!(refused.is_failure());
    Ok(())
}

#[tokio::test]
async fn signer_keys_follow_the_role_and_only_the_owner_manages_them() -> anyhow::Result<()> {
    let env = Env::new().await?;
    env.admin(
        "grant_role",
        json!({"role": "reserve_attester", "account_id": env.alice.id()}),
    )
    .await?
    .into_result()?;
    let add = |key: String, scopes: Value| json!({"role": "reserve_attester", "account_id": env.alice.id(), "public_key": key, "scopes": scopes});
    // A scope outside the role's set is refused; nothing is stored.
    let bad = env
        .admin("add_signer_key", add(public_key(7), json!(["bridge"])))
        .await?;
    assert!(bad.is_failure());
    assert!(keys(&env, "reserve_attester").await?.is_empty());
    // Bob is not the owner.
    let by_bob = env
        .call_as(
            &env.bob,
            "add_signer_key",
            add(public_key(7), json!(["reserves"])),
        )
        .await?;
    assert!(by_bob.is_failure());
    assert!(keys(&env, "reserve_attester").await?.is_empty());

    env.admin("add_signer_key", add(public_key(7), json!(["reserves"])))
        .await?
        .into_result()?;
    let stored = keys(&env, "reserve_attester").await?;
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0]["account_id"], env.alice.id().as_str());
    assert_eq!(stored[0]["scopes"], json!(["reserves"]));

    // Revoking the role removes the key with it.
    env.admin(
        "revoke_role",
        json!({"role": "reserve_attester", "account_id": env.alice.id()}),
    )
    .await?
    .into_result()?;
    assert!(keys(&env, "reserve_attester").await?.is_empty());
    assert!(roles_of(&env, env.alice.id().as_str()).await?.is_empty());
    Ok(())
}
