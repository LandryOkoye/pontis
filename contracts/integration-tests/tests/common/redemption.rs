//! Redemption helpers (ADR 0020 section 7). alice redeems, carol is the issuer's back office, the
//! owner (registrar) sets the terms. The payout instruction is a hash of a stand-in ciphertext.

use super::*;
/// A fixed 64-hex payout instruction hash; the contract only checks the grammar.
fn payout_hash() -> String {
    "5e".repeat(32)
}

impl Env {
    /// Terms: minimum 1 A, fee 25 bps, always open, `accept_within_ms` to accept, 1 day to fulfil.
    pub async fn set_terms(&self, accept_within_ms: u64) -> anyhow::Result<()> {
        self.admin("set_redemption_terms", json!({"representation_id": "tgold-a", "terms": {
            "min_amount": ONE_A.to_string(), "max_amount": "0", "fee_bps": 25, "window_anchor_ms": 0,
            "window_length_ms": 0, "window_period_ms": 0, "accept_within_ms": accept_within_ms,
            "settlement_days": 1}}))
            .await?
            .into_result()?;
        Ok(())
    }

    pub async fn terms_hash(&self) -> anyhow::Result<String> {
        let t = self
            .core_view(
                "get_redemption_terms",
                json!({"representation_id": "tgold-a"}),
            )
            .await?;
        Ok(t["terms_hash"].as_str().unwrap().to_string())
    }

    /// `ft_transfer_call` of `amount` TGOLD-A from `who` with a redeem message quoting `terms_hash`.
    pub async fn redeem(
        &self,
        who: &Account,
        amount: u128,
        terms_hash: &str,
    ) -> anyhow::Result<ExecutionFinalResult> {
        let msg = format!("redeem:{terms_hash}:{}", payout_hash());
        self.convert(who, amount, &msg).await
    }

    /// A custody setup with `units` attested and `to` holding `minted` through the gate.
    pub async fn minted_holder(
        &self,
        to: &AccountId,
        attested: u128,
        minted: u128,
    ) -> anyhow::Result<()> {
        self.setup_custody("warn", 3_600_000, 0).await?;
        self.attest_now(attested).await?.into_result()?;
        self.mint_through_gate(to, minted).await?.into_result()?;
        Ok(())
    }

    pub async fn redemption(&self, id: u64) -> anyhow::Result<Value> {
        self.core_view("get_redemption", json!({"id": id})).await
    }

    pub async fn escrow(&self) -> anyhow::Result<Value> {
        self.core_view("get_escrow_ledger", json!({"representation_id": "tgold-a"}))
            .await
    }

    /// in = burned + returned + held, held = open requests, and the core's token balance covers
    /// inventory, pending input and the held escrow.
    pub async fn assert_conserved(&self) -> anyhow::Result<()> {
        let l = self.escrow().await?;
        let n = |k: &str| l[k].as_str().unwrap().parse::<u128>().unwrap();
        assert_eq!(
            n("escrowed_in"),
            n("burned") + n("returned") + n("held"),
            "{l}"
        );
        assert_eq!(l["held"], l["open_amount"], "{l}");
        let balance = self.balance(&self.token_a, self.core.id()).await?;
        let accounted =
            self.inventory("tgold-a").await? + self.pending_inbound("tgold-a").await? + n("held");
        assert_eq!(
            balance, accounted,
            "the core's token balance covers inventory, pending input and escrow"
        );
        Ok(())
    }
}
