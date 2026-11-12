//! Custody, reserve and mint helpers (ADR 0020). bob is the reserve attester (alice relays his
//! signed attestations), carol is the issuer's back office, and the owner is the registrar.
//! The attestation is signed with a hand-written Borsh encoding, independent of the contract.

use super::*;
use base64::Engine;
use ed25519_dalek::Signer;

fn borsh_str(out: &mut Vec<u8>, s: &str) {
    out.extend((s.len() as u32).to_le_bytes());
    out.extend(s.as_bytes());
}

pub fn reserve_seed() -> SigningKey {
    SigningKey::from_bytes(&(201..=232u8).collect::<Vec<_>>().try_into().unwrap())
}

impl Env {
    pub fn reserve_public_key(&self) -> String {
        near_workspaces::types::PublicKey::try_from_parts(
            near_workspaces::types::KeyType::ED25519,
            &reserve_seed().verifying_key().to_bytes(),
        )
        .unwrap()
        .to_string()
    }

    /// Registers the attester key, the custodian `vault-co-sim`, links it to TGOLD-A, sets the
    /// reserve policy (no tolerance, `max_age_ms`, `action`, `baseline` supply already minted) and makes core the minter of TGOLD-A.
    pub async fn setup_custody(
        &self,
        action: &str,
        max_age_ms: u64,
        baseline: u128,
    ) -> anyhow::Result<()> {
        let bob = self.bob.id();
        self.admin(
            "grant_role",
            json!({"role": "reserve_attester", "account_id": bob}),
        )
        .await?
        .into_result()?;
        self.admin(
            "add_signer_key",
            json!({"role": "reserve_attester", "account_id": bob,
            "public_key": self.reserve_public_key(), "scopes": ["reserves"]}),
        )
        .await?
        .into_result()?;
        self.admin("register_custodian", json!({"custodian": {"id": "vault-co-sim", "name": "Vault Co (SYNTHETIC)",
            "jurisdiction": "CH", "attester_key": self.reserve_public_key(), "synthetic": true,
            "verification_status": "unverified", "evidence": [{"uri": "docs/asset-dossiers/TGOLD-A.md",
            "sha256": "a3f1c2d4e5b60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
            "provenance": "issuer_provided", "description": "Self-attested synthetic dossier"}]}}))
            .await?
            .into_result()?;
        self.admin(
            "link_custody",
            json!({"representation_id": "tgold-a", "structure": "segregated",
            "custodian_ids": ["vault-co-sim"]}),
        )
        .await?
        .into_result()?;
        self.admin("set_reserve_policy", json!({"representation_id": "tgold-a", "policy": {"tolerance_bps": 0,
            "max_reserve_age_ms": max_age_ms, "action": action, "baseline_supply": baseline.to_string()}}))
            .await?
            .into_result()?;
        self.owner
            .call(self.token_a.id(), "set_minter")
            .args_json(json!({"minter": self.core.id()}))
            .deposit(yocto(1))
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    /// The attestation JSON for `units` of TGOLD-A as of `as_of_ms`.
    pub fn attestation(&self, units: u128, as_of_ms: u64) -> Value {
        json!({"version": 1, "contract": self.core.id(), "representation_id": "tgold-a",
            "custodian_id": "vault-co-sim", "reserved_units": units.to_string(), "as_of_ms": as_of_ms,
            "report_hash": "ab".repeat(32), "report_uri": "sim://reserves/tgold-a", "simulated": true,
            "source": "simulated_custodian"})
    }

    /// `b"pontis-reserve-v1" ++ borsh(...)`, written out by hand from ADR 0020 section 3.
    pub fn reserve_message(&self, a: &Value) -> Vec<u8> {
        let s = |k: &str| a[k].as_str().unwrap().to_string();
        let mut out = b"pontis-reserve-v1".to_vec();
        out.push(1);
        for k in ["contract", "representation_id", "custodian_id"] {
            borsh_str(&mut out, &s(k));
        }
        out.extend(s("reserved_units").parse::<u128>().unwrap().to_le_bytes());
        out.extend(a["as_of_ms"].as_u64().unwrap().to_le_bytes());
        out.extend(
            (0..32).map(|i| u8::from_str_radix(&s("report_hash")[2 * i..2 * i + 2], 16).unwrap()),
        );
        borsh_str(&mut out, &s("report_uri"));
        out.push(a["simulated"].as_bool().unwrap() as u8);
        borsh_str(&mut out, &s("source"));
        out
    }

    /// Submits `a` signed by the reserve key, relayed by alice.
    pub async fn submit_reserve(&self, a: &Value) -> anyhow::Result<ExecutionFinalResult> {
        let sig = reserve_seed().sign(&self.reserve_message(a)).to_bytes();
        self.call_as(
            &self.alice,
            "submit_reserve_attestation",
            json!({"attestation": a, "signature": base64::engine::general_purpose::STANDARD.encode(sig),
                "public_key": self.reserve_public_key()}),
        )
        .await
    }

    /// Attests `units` as of now.
    pub async fn attest_now(&self, units: u128) -> anyhow::Result<ExecutionFinalResult> {
        let t = self.now_ms().await?;
        self.submit_reserve(&self.attestation(units, t)).await
    }

    pub async fn reserve_status(&self) -> anyhow::Result<Value> {
        self.core_view(
            "get_reserve_status",
            json!({"representation_id": "tgold-a"}),
        )
        .await
    }

    /// The back office (carol) requests a mint to `to` and executes it.
    pub async fn mint_through_gate(
        &self,
        to: &AccountId,
        amount: u128,
    ) -> anyhow::Result<ExecutionFinalResult> {
        let id = self
            .core_view(
                "get_mint_requests",
                json!({"representation_id": "tgold-a", "from_index": 0, "limit": 100}),
            )
            .await?["total"]
            .as_u64()
            .unwrap()
            + 1;
        self.call_as(
            &self.carol,
            "request_mint",
            json!({"representation_id": "tgold-a", "recipient": to,
            "amount": amount.to_string(), "reference": format!("sub-{id}")}),
        )
        .await?
        .into_result()?;
        self.call_as(&self.carol, "execute_mint", json!({"request_id": id}))
            .await
    }

    pub async fn supply_view(&self) -> anyhow::Result<Value> {
        self.core_view("get_supply", json!({"representation_id": "tgold-a"}))
            .await
    }
}
