//! Quotes signed like the backend does, and the `ft_transfer_call` that spends them.

use super::*;
use base64::Engine;
use ed25519_dalek::Signer;

impl Env {
    /// Expected `(gross, fee, net)` for an A to B conversion, computed independently of the contract.
    pub fn expected_a_to_b(amount_in: u128) -> (u128, u128, u128) {
        let gross = amount_in * RATIO_A_TO_B;
        let fee = (gross * FEE_BPS).div_ceil(10_000);
        (gross, fee, gross - fee)
    }

    /// A signed `msg` for converting `amount_in` of A to B for `user`, valid for `ttl_ms`.
    pub async fn signed_msg(
        &self,
        user: &Account,
        amount_in: u128,
        ttl_ms: i64,
    ) -> anyhow::Result<String> {
        self.signed_msg_for(user, true, amount_in, ttl_ms).await
    }

    /// Expected `(gross, fee, net)` for a B to A conversion: 1000 smallest B is 1 smallest A.
    pub fn expected_b_to_a(amount_in: u128) -> (u128, u128, u128) {
        let gross = amount_in / RATIO_A_TO_B;
        let fee = (gross * FEE_BPS).div_ceil(10_000);
        (gross, fee, gross - fee)
    }

    /// A signed `msg` converting `amount_in` for `user`: A to B when `a_to_b`, else B to A.
    pub async fn signed_msg_for(
        &self,
        user: &Account,
        a_to_b: bool,
        amount_in: u128,
        ttl_ms: i64,
    ) -> anyhow::Result<String> {
        let (token_in, token_out, from, to) = if a_to_b {
            (&self.token_a, &self.token_b, "tgold-a", "tgold-b")
        } else {
            (&self.token_b, &self.token_a, "tgold-b", "tgold-a")
        };
        let route: Value = self
            .core
            .view("get_route")
            .args_json(json!({"from_id": from, "to_id": to}))
            .await?
            .json()?;
        let terms = &route["terms"];
        let (gross, fee, net) = if a_to_b {
            Self::expected_a_to_b(amount_in)
        } else {
            Self::expected_b_to_a(amount_in)
        };
        let n = self.nonce.get();
        self.nonce.set(n + 1);
        let nonce = format!("{n:032x}");
        let expires = (self.now_ms().await? as i64 + ttl_ms) as u64;
        let (cv, pv) = (
            terms["compatibility_version"].as_u64().unwrap(),
            terms["policy_version"].as_u64().unwrap(),
        );

        // Borsh by hand, deliberately independent of the contract code.
        let mut m = b"pontis-quote-v1".to_vec();
        m.push(1);
        for id in [self.core.id(), user.id(), token_in.id(), token_out.id()] {
            m.extend((id.as_str().len() as u32).to_le_bytes());
            m.extend(id.as_str().as_bytes());
        }
        for v in [amount_in, gross, fee, net] {
            m.extend(v.to_le_bytes());
        }
        m.extend((FEE_BPS as u16).to_le_bytes());
        m.extend(expires.to_le_bytes());
        m.extend((0..16).map(|i| u8::from_str_radix(&nonce[i * 2..i * 2 + 2], 16).unwrap()));
        m.extend(cv.to_le_bytes());
        m.extend(pv.to_le_bytes());
        let signature =
            base64::engine::general_purpose::STANDARD.encode(self.signer.sign(&m).to_bytes());
        Ok(json!({"quote": {"version": 1, "contract": self.core.id(), "user": user.id(), "token_in": token_in.id(),
            "token_out": token_out.id(), "amount_in": amount_in.to_string(), "amount_out_gross": gross.to_string(),
            "fee": fee.to_string(), "amount_out": net.to_string(), "fee_bps": FEE_BPS, "expires_at_ms": expires,
            "nonce": nonce, "compatibility_version": cv, "policy_version": pv}, "signature": signature}).to_string())
    }

    /// `ft_transfer_call` of `amount` TGOLD-A from `who` into core with `msg`.
    pub async fn convert(
        &self,
        who: &Account,
        amount: u128,
        msg: &str,
    ) -> anyhow::Result<ExecutionFinalResult> {
        Ok(who
            .call(self.token_a.id(), "ft_transfer_call")
            .args_json(
                json!({"receiver_id": self.core.id(), "amount": amount.to_string(), "msg": msg}),
            )
            .deposit(yocto(1))
            .max_gas()
            .transact()
            .await?)
    }
}

/// Every `EVENT_JSON` log of the given event name across all receipts.
pub fn events(result: &ExecutionFinalResult, name: &str) -> Vec<Value> {
    result
        .logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| serde_json::from_str::<Value>(j).ok())
        .filter(|v| v["event"] == name)
        .collect()
}
