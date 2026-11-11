//! Shared sandbox setup: two synthetic tokens (TGOLD-A with 6 decimals, TGOLD-B with 8) and one
//! `pontis-core`, with the pair registered, approved and the vault funded, as the seed script does
//! on testnet. Contracts must be built first: `scripts/build-contracts.sh`.

#![allow(dead_code)]

use ed25519_dalek::SigningKey;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::{network::Sandbox, types::NearToken, Account, AccountId, Contract, Worker};
use serde_json::{json, Value};
use std::path::PathBuf;

pub const ONE_A: u128 = 1_000_000;
pub const ONE_B: u128 = 100_000_000;
/// 10 B in A-sized terms: the approved ratio is 1 A = 10 B (1000 smallest B per smallest A).
pub const RATIO_A_TO_B: u128 = 1000;
pub const FEE_BPS: u128 = 10;

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub owner: Account,
    pub alice: Account,
    pub bob: Account,
    pub carol: Account,
    pub core: Contract,
    pub token_a: Contract,
    pub token_b: Contract,
    pub(super) signer: SigningKey,
    pub(super) nonce: std::cell::Cell<u128>,
    pub fixture_b: bool,
}

pub fn wasm(name: &str) -> Vec<u8> {
    let dir = std::env::var("PONTIS_WASM_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/near"));
    let path = dir.join(name).join(format!("{name}.wasm"));
    std::fs::read(&path).unwrap_or_else(|e| {
        panic!(
            "missing {}: {e}. Build contracts first with scripts/build-contracts.sh",
            path.display()
        )
    })
}

pub fn near(n: u128) -> NearToken {
    NearToken::from_near(n)
}

pub fn yocto(n: u128) -> NearToken {
    NearToken::from_yoctonear(n)
}

impl Env {
    pub async fn new() -> anyhow::Result<Env> {
        Self::build(false).await
    }

    /// Like `new`, but TGOLD-B is the `mock-payout-token` fixture: its payouts stay pending until
    /// `release_payout` resolves them. It keeps no balances; assert B-side effects through the vault.
    pub async fn with_held_payouts() -> anyhow::Result<Env> {
        Self::build(true).await
    }

    async fn build(fixture_b: bool) -> anyhow::Result<Env> {
        let worker = near_workspaces::sandbox().await?;
        let root = worker.root_account()?;
        let mut accounts = vec![];
        for name in ["owner", "alice", "bob", "carol", "core", "tgolda", "tgoldb"] {
            let balance = if name.starts_with("t") || name == "core" {
                30
            } else {
                10
            };
            accounts.push(
                root.create_subaccount(name)
                    .initial_balance(near(balance))
                    .transact()
                    .await?
                    .into_result()?,
            );
        }
        let [owner, alice, bob, carol, core_acct, a_acct, b_acct]: [Account; 7] =
            accounts.try_into().unwrap();
        let core = core_acct
            .deploy(&wasm("pontis_core"))
            .await?
            .into_result()?;
        let token_a = a_acct
            .deploy(&wasm("synthetic_token"))
            .await?
            .into_result()?;
        let b_wasm = wasm(if fixture_b {
            "mock_payout_token"
        } else {
            "synthetic_token"
        });
        let token_b = b_acct.deploy(&b_wasm).await?.into_result()?;
        let seed: [u8; 32] = (1..=32u8).collect::<Vec<_>>().try_into().unwrap();
        let env = Env {
            worker,
            owner,
            alice,
            bob,
            carol,
            core,
            token_a,
            token_b,
            signer: SigningKey::from_bytes(&seed),
            nonce: std::cell::Cell::new(1),
            fixture_b,
        };
        env.init_and_register().await?;
        Ok(env)
    }

    /// Admin call on core as the owner with the required 1 yoctoNEAR.
    pub async fn admin(&self, method: &str, args: Value) -> anyhow::Result<ExecutionFinalResult> {
        Ok(self
            .owner
            .call(self.core.id(), method)
            .args_json(args)
            .deposit(yocto(1))
            .max_gas()
            .transact()
            .await?)
    }

    async fn ok(&self, method: &str, args: Value) -> anyhow::Result<()> {
        self.admin(method, args).await?.into_result()?;
        Ok(())
    }
}

mod checks;
mod guards;
mod ops;
mod quotes;
mod setup;

#[allow(unused_imports)] // each test binary uses a subset
pub use checks::{assert_refunded, funded};
pub use guards::E8;
pub use quotes::events;
mod pending;
