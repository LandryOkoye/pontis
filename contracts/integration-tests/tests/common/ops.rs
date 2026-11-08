//! Small helpers over the sandbox: registration, minting, vault funding and views.

use super::*;

impl Env {
    pub async fn register(&self, token: &Contract, who: &AccountId) -> anyhow::Result<()> {
        self.owner
            .call(token.id(), "storage_deposit")
            .args_json(json!({"account_id": who, "registration_only": true}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    pub async fn mint(&self, token: &Contract, to: &AccountId, amount: u128) -> anyhow::Result<()> {
        self.owner
            .call(token.id(), "mint")
            .args_json(json!({"account_id": to, "amount": amount.to_string()}))
            .deposit(yocto(1))
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    /// Mints to the owner and funds the vault through `ft_transfer_call` with `fund_vault`.
    pub async fn fund_vault(&self, token: &Contract, amount: u128) -> anyhow::Result<()> {
        self.mint(token, self.owner.id(), amount).await?;
        self.owner.call(token.id(), "ft_transfer_call")
            .args_json(json!({"receiver_id": self.core.id(), "amount": amount.to_string(), "msg": "fund_vault"}))
            .deposit(yocto(1)).max_gas().transact().await?.into_result()?;
        Ok(())
    }

    pub async fn balance(&self, token: &Contract, who: &AccountId) -> anyhow::Result<u128> {
        let v: String = token
            .view("ft_balance_of")
            .args_json(json!({"account_id": who}))
            .await?
            .json()?;
        Ok(v.parse()?)
    }

    pub async fn inventory(&self, rep: &str) -> anyhow::Result<u128> {
        let v: String = self
            .core
            .view("get_inventory")
            .args_json(json!({"representation_id": rep}))
            .await?
            .json()?;
        Ok(v.parse()?)
    }

    pub async fn now_ms(&self) -> anyhow::Result<u64> {
        Ok(self.worker.view_block().await?.timestamp() / 1_000_000)
    }
}
