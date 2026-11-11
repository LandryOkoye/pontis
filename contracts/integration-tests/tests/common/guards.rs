//! Price attestations signed like the simulator does, guard setup and quotes with a custom fee.

use super::*;
use base64::Engine;
use ed25519_dalek::Signer;

pub const E8: u128 = 100_000_000;

fn publisher_seed() -> SigningKey {
    let seed: [u8; 32] = (101..=132u8).collect::<Vec<_>>().try_into().unwrap();
    SigningKey::from_bytes(&seed)
}

fn borsh_str(out: &mut Vec<u8>, s: &str) {
    out.extend((s.len() as u32).to_le_bytes());
    out.extend(s.as_bytes());
}

impl Env {
    pub fn publisher_signing_key(&self) -> SigningKey {
        publisher_seed()
    }

    pub fn publisher_public_key(&self) -> String {
        near_workspaces::types::PublicKey::try_from_parts(
            near_workspaces::types::KeyType::ED25519,
            &publisher_seed().verifying_key().to_bytes(),
        )
        .unwrap()
        .to_string()
    }

    /// A call to core as `who` with 1 yoctoNEAR.
    pub async fn call_as(
        &self,
        who: &Account,
        method: &str,
        args: Value,
    ) -> anyhow::Result<ExecutionFinalResult> {
        Ok(who
            .call(self.core.id(), method)
            .args_json(args)
            .deposit(yocto(1))
            .max_gas()
            .transact()
            .await?)
    }

    /// Submits a signed price for `rep` (whole-USD price times 1e8) with `as_of_ms`.
    pub async fn submit_price(
        &self,
        rep: &str,
        price: u128,
        as_of_ms: u64,
    ) -> anyhow::Result<ExecutionFinalResult> {
        // Borsh by hand, independent of the contract code.
        let mut m = b"pontis-price-v2".to_vec();
        m.push(1);
        borsh_str(&mut m, self.core.id().as_str());
        borsh_str(&mut m, rep);
        m.extend(price.to_le_bytes());
        borsh_str(&mut m, "USD");
        m.extend(as_of_ms.to_le_bytes());
        m.push(1);
        borsh_str(&mut m, "simulated_feed");
        let signature =
            base64::engine::general_purpose::STANDARD.encode(publisher_seed().sign(&m).to_bytes());
        self.call_as(
            &self.carol,
            "submit_price",
            json!({"attestation": {"version": 1, "contract": self.core.id(), "representation_id": rep,
                "price": price.to_string(), "currency": "USD", "as_of_ms": as_of_ms, "simulated": true,
                "source": "simulated_feed"}, "signature": signature, "public_key": self.publisher_public_key()}),
        )
        .await
    }

    /// Both prices in whole USD: parity is 100 for A and 10 for B.
    pub async fn submit_prices(&self, a: u128, b: u128, as_of_ms: u64) -> anyhow::Result<()> {
        for (rep, usd) in [("tgold-a", a), ("tgold-b", b)] {
            let r = self.submit_price(rep, usd * E8, as_of_ms).await?;
            assert!(r.is_success(), "{:?}", r.failures());
        }
        Ok(())
    }

    /// Sets the guard of the pair as the owner (a compat approver).
    pub async fn set_guard(&self, overrides: Value) -> anyhow::Result<ExecutionFinalResult> {
        let mut guard = json!({"max_deviation_bps": 100, "hard_deviation_bps": 1000, "trip_after": 3,
            "max_price_age_ms": 3_600_000, "stale_policy": "fail_closed", "min_amount_in": "0",
            "max_amount_in": "0", "window_ms": 0, "max_window_amount_in": "0", "skew_max_bps": 0});
        for (k, v) in overrides.as_object().unwrap() {
            guard[k] = v.clone();
        }
        self.call_as(
            &self.owner,
            "set_route_guard",
            json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b", "guard": guard}),
        )
        .await
    }

    pub async fn compat_version_and_status(&self) -> anyhow::Result<(u64, String)> {
        let rel: Value = self
            .core
            .view("get_compatibility")
            .args_json(json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b"}))
            .await?
            .json()?;
        Ok((
            rel["version"].as_u64().unwrap(),
            rel["status"].as_str().unwrap().to_string(),
        ))
    }

    /// A signed A to B quote with an explicit fee and versions, so it can be built while the route
    /// is closed. Amounts are computed here, independently of the contract.
    pub async fn signed_msg_with_fee(
        &self,
        user: &Account,
        amount_in: u128,
        fee_bps: u16,
        compatibility_version: u64,
    ) -> anyhow::Result<String> {
        let gross = amount_in * RATIO_A_TO_B;
        let fee = (gross * u128::from(fee_bps)).div_ceil(10_000);
        let net = gross - fee;
        let n = self.nonce.get();
        self.nonce.set(n + 1);
        let nonce = format!("{n:032x}");
        let expires = self.now_ms().await? + 600_000;
        let mut m = b"pontis-quote-v1".to_vec();
        m.push(1);
        for id in [
            self.core.id(),
            user.id(),
            self.token_a.id(),
            self.token_b.id(),
        ] {
            borsh_str(&mut m, id.as_str());
        }
        for v in [amount_in, gross, fee, net] {
            m.extend(v.to_le_bytes());
        }
        m.extend(fee_bps.to_le_bytes());
        m.extend(expires.to_le_bytes());
        m.extend((0..16).map(|i| u8::from_str_radix(&nonce[i * 2..i * 2 + 2], 16).unwrap()));
        m.extend(compatibility_version.to_le_bytes());
        m.extend(1u64.to_le_bytes());
        let signature =
            base64::engine::general_purpose::STANDARD.encode(self.signer.sign(&m).to_bytes());
        Ok(json!({"quote": {"version": 1, "contract": self.core.id(), "user": user.id(),
            "token_in": self.token_a.id(), "token_out": self.token_b.id(), "amount_in": amount_in.to_string(),
            "amount_out_gross": gross.to_string(), "fee": fee.to_string(), "amount_out": net.to_string(),
            "fee_bps": fee_bps, "expires_at_ms": expires, "nonce": nonce, "compatibility_version": compatibility_version,
            "policy_version": 1}, "signature": signature})
        .to_string())
    }
}
