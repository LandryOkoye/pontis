//! Holding a conversion's payout open on the `mock-payout-token` fixture, so a test can act in the
//! interval where the input is held but the payout has not resolved. `Env::with_held_payouts`.

use super::*;
use near_workspaces::operations::TransactionStatus;
use std::task::Poll;
use std::time::Duration;

const POLL: Duration = Duration::from_millis(250);
const ATTEMPTS: usize = 240;

impl Env {
    pub async fn pending_inbound(&self, rep: &str) -> anyhow::Result<u128> {
        let v: String = self
            .core
            .view("get_pending_inbound")
            .args_json(json!({"representation_id": rep}))
            .await?
            .json()?;
        Ok(v.parse()?)
    }

    /// Sends the A to B `ft_transfer_call` for `who` and returns without waiting for its receipts.
    pub async fn start_conversion(
        &self,
        who: &Account,
        amount: u128,
        msg: &str,
    ) -> anyhow::Result<TransactionStatus> {
        Ok(who
            .call(self.token_a.id(), "ft_transfer_call")
            .args_json(
                json!({"receiver_id": self.core.id(), "amount": amount.to_string(), "msg": msg}),
            )
            .deposit(yocto(1))
            .max_gas()
            .transact_async()
            .await?)
    }

    /// Waits until the fixture holds a payout to `receiver`: the input is then pending in core.
    pub async fn wait_for_held_payout(&self, receiver: &AccountId) -> anyhow::Result<()> {
        for _ in 0..ATTEMPTS {
            let held: bool = self
                .token_b
                .view("is_held")
                .args_json(json!({"receiver_id": receiver}))
                .await?
                .json()?;
            if held {
                return Ok(());
            }
            tokio::time::sleep(POLL).await;
        }
        anyhow::bail!("no payout to {receiver} was held in time")
    }

    /// Resolves the held payout to `receiver`: it succeeds, or fails like an unregistered account.
    pub async fn release_payout(&self, receiver: &AccountId, succeed: bool) -> anyhow::Result<()> {
        self.owner
            .call(self.token_b.id(), "release")
            .args_json(json!({"receiver_id": receiver, "succeed": succeed}))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    /// Waits for every receipt of a transaction started with `start_conversion`.
    pub async fn finish(&self, tx: &TransactionStatus) -> anyhow::Result<ExecutionFinalResult> {
        for _ in 0..ATTEMPTS {
            if let Poll::Ready(result) = tx.status().await? {
                return Ok(result);
            }
            tokio::time::sleep(POLL).await;
        }
        anyhow::bail!("the conversion did not finish in time")
    }

    /// `ft_transfer_call` of `amount` TGOLD-B from `who` into core, through the fixture token.
    pub async fn convert_from_b(
        &self,
        who: &Account,
        amount: u128,
        msg: &str,
    ) -> anyhow::Result<ExecutionFinalResult> {
        Ok(who
            .call(self.token_b.id(), "ft_transfer_call")
            .args_json(
                json!({"receiver_id": self.core.id(), "amount": amount.to_string(), "msg": msg}),
            )
            .deposit(yocto(1))
            .max_gas()
            .transact()
            .await?)
    }

    /// The owner's `withdraw_inventory`, returning the transaction result (it may fail).
    pub async fn withdraw(&self, rep: &str, amount: u128) -> anyhow::Result<ExecutionFinalResult> {
        self.admin(
            "withdraw_inventory",
            json!({"representation_id": rep, "amount": amount.to_string(), "receiver_id": self.owner.id()}),
        )
        .await
    }
}
