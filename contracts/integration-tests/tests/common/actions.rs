//! Corporate action, lifecycle and NAV helpers. The owner is registrar and first approver, bob
//! (granted `compat_approver` by the test) is the second approver every approval needs.

use super::*;
use base64::Engine;
use ed25519_dalek::Signer;

fn borsh_str(out: &mut Vec<u8>, s: &str) {
    out.extend((s.len() as u32).to_le_bytes());
    out.extend(s.as_bytes());
}

impl Env {
    pub async fn core_view(&self, method: &str, args: Value) -> anyhow::Result<Value> {
        Ok(self.core.view(method).args_json(args).await?.json()?)
    }

    /// Moves the sandbox clock to at least `target_ms` (a block is about 0.3 s).
    pub async fn advance_to(&self, target_ms: u64) -> anyhow::Result<()> {
        loop {
            let now = self.now_ms().await?;
            if now >= target_ms {
                return Ok(());
            }
            self.worker
                .fast_forward(((target_ms - now) / 400).max(1))
                .await?;
        }
    }

    /// The `get_route` view of A to B.
    pub async fn route(&self) -> anyhow::Result<Value> {
        self.core_view(
            "get_route",
            json!({"from_id": "tgold-a", "to_id": "tgold-b"}),
        )
        .await
    }

    pub async fn refusal(&self) -> anyhow::Result<Value> {
        Ok(self.route().await?["refusal"].clone())
    }

    /// Grants bob `compat_approver` and registers the price publisher key.
    pub async fn with_second_approver_and_publisher(&self) -> anyhow::Result<()> {
        self.admin(
            "grant_role",
            json!({"role": "compat_approver", "account_id": self.bob.id()}),
        )
        .await?
        .into_result()?;
        self.admin(
            "add_price_publisher_key",
            json!({"public_key": self.publisher_public_key()}),
        )
        .await?
        .into_result()?;
        Ok(())
    }

    /// Proposes a 2:1 split of the claim as the registrar and has bob approve it. Returns its ID.
    pub async fn schedule_split(
        &self,
        freeze_from: u64,
        effective: u64,
        freeze_until: u64,
    ) -> anyhow::Result<String> {
        let proposed = self
            .admin(
                "propose_corporate_action",
                json!({"action": {"asset_id": "syn-gold-oz", "kind": "split", "announced_at_ms": freeze_from,
                    "ex_date_ms": effective, "effective_ms": effective, "freeze_from_ms": freeze_from,
                    "freeze_until_ms": freeze_until, "multiplier_change": {"num": "1", "den": "2"}}}),
            )
            .await?;
        let id: String = proposed.json()?;
        let approved = self
            .call_as(
                &self.bob,
                "approve_corporate_action",
                json!({"action_id": id, "rationale": "Reviewed"}),
            )
            .await?;
        assert!(approved.is_success(), "{:?}", approved.failures());
        Ok(id)
    }

    /// Applies the split to a wrapper: 1/1,000,000 and 1/1,000,000,000 become half.
    pub async fn apply_split(
        &self,
        action_id: &str,
        rep: &str,
    ) -> anyhow::Result<ExecutionFinalResult> {
        let den = if rep == "tgold-a" {
            "2000000"
        } else {
            "2000000000"
        };
        self.admin(
            "apply_corporate_action",
            json!({"action_id": action_id, "representation_id": rep,
                "new_multiplier": {"num": "1", "den": den}}),
        )
        .await
    }

    pub async fn set_flags(
        &self,
        rep: &str,
        kind: &str,
        no_conversion: bool,
    ) -> anyhow::Result<ExecutionFinalResult> {
        self.admin(
            "set_lifecycle_flags",
            json!({"representation_id": rep, "kind": kind, "no_conversion": no_conversion, "bridge_only": false}),
        )
        .await
    }

    /// Posts a NAV strike for `rep` signed like the simulator does (`pontis-nav-v1`).
    pub async fn submit_nav(
        &self,
        rep: &str,
        nav: u128,
        as_of_ms: u64,
        cutoff_ms: u64,
    ) -> anyhow::Result<ExecutionFinalResult> {
        // Borsh by hand, independent of the contract code.
        let mut m = b"pontis-nav-v1".to_vec();
        m.push(1);
        borsh_str(&mut m, self.core.id().as_str());
        borsh_str(&mut m, rep);
        m.extend(nav.to_le_bytes());
        borsh_str(&mut m, "USD");
        m.extend(as_of_ms.to_le_bytes());
        m.extend(cutoff_ms.to_le_bytes());
        m.push(1);
        borsh_str(&mut m, "simulated_fund_admin");
        let signature = base64::engine::general_purpose::STANDARD
            .encode(self.publisher_signing_key().sign(&m).to_bytes());
        self.call_as(
            &self.carol,
            "submit_nav_strike",
            json!({"attestation": {"version": 1, "contract": self.core.id(), "representation_id": rep,
                "nav": nav.to_string(), "currency": "USD", "as_of_ms": as_of_ms, "cutoff_ms": cutoff_ms,
                "simulated": true, "source": "simulated_fund_admin"},
                "signature": signature, "public_key": self.publisher_public_key()}),
        )
        .await
    }
}
