//! Registers the MVP pair exactly as `scripts/seed-testnet.ts` does on testnet.

use super::*;

const SHA: &str = "a3f1c2d4e5b60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

impl Env {
    pub(super) async fn init_and_register(&self) -> anyhow::Result<()> {
        let owner = self.owner.id();
        for (token, name, symbol, decimals) in [
            (&self.token_a, "SYNTHETIC TEST Gold A", "TGOLD-A", 6),
            (&self.token_b, "SYNTHETIC TEST Gold B", "TGOLD-B", 8),
        ] {
            token
                .call("new")
                .args_json(
                    json!({"owner_id": owner, "name": name, "symbol": symbol, "decimals": decimals,
                    "faucet_max_per_call": null, "faucet_cooldown_ms": null}),
                )
                .transact()
                .await?
                .into_result()?;
        }
        self.core
            .call("new")
            .args_json(json!({"owner_id": owner}))
            .transact()
            .await?
            .into_result()?;
        for role in ["registrar", "compat_approver", "pauser"] {
            self.ok("grant_role", json!({"role": role, "account_id": owner}))
                .await?;
        }
        let evidence = |d: &str| {
            json!({"uri": format!("docs/asset-dossiers/{d}.md"), "sha256": SHA,
            "provenance": "issuer_provided", "description": "Self-attested synthetic dossier"})
        };
        for id in ["issuer-a", "issuer-b"] {
            self.ok("register_issuer", json!({"issuer": {"id": id, "name": format!("Synthetic {id}"), "jurisdiction": null,
                "authorized_categories": ["synthetic test claims"], "controlled_accounts": [], "contact": null,
                "synthetic": true, "verification_status": "unverified"}})).await?;
            self.ok("add_evidence", json!({"subject_type": "issuer", "subject_id": id, "evidence": evidence("TGOLD-A")})).await?;
            self.ok("set_issuer_status", json!({"id": id, "status": "active"}))
                .await?;
        }
        let t = "None";
        self.ok("register_canonical_asset", json!({"asset": {"id": "syn-gold-oz", "name": "Synthetic Gold, one troy ounce",
            "category": "Synthetic commodity claim", "claim_description": "Fictional claim", "unit_definition": "1 unit = 1 fictional troy ounce",
            "denomination": null, "economic_rights": t, "legal_claim_structure": t, "jurisdiction": null, "redemption_terms": t,
            "valuation_method": null, "eligibility_restrictions": "Testnet allowlist", "risk_disclosures": ["Not backed by any asset"],
            "synthetic": true, "verification_status": "unverified"}})).await?;
        self.ok("add_evidence", json!({"subject_type": "canonical_asset", "subject_id": "syn-gold-oz", "evidence": evidence("SYN-GOLD-OZ")})).await?;
        self.ok(
            "set_canonical_asset_status",
            json!({"id": "syn-gold-oz", "status": "active"}),
        )
        .await?;
        for (id, issuer, token, symbol, decimals, den) in [
            (
                "tgold-a",
                "issuer-a",
                &self.token_a,
                "TGOLD-A",
                6,
                1_000_000u128,
            ),
            (
                "tgold-b",
                "issuer-b",
                &self.token_b,
                "TGOLD-B",
                8,
                1_000_000_000u128,
            ),
        ] {
            self.ok("register_representation", json!({"representation": {"id": id, "canonical_asset_id": "syn-gold-oz",
                "issuer_id": issuer, "account_id": token.id(), "name": format!("SYNTHETIC TEST {symbol}"), "symbol": symbol,
                "decimals": decimals, "unit_multiplier": {"num": "1", "den": den.to_string()}, "admin_capabilities": ["owner mint"],
                "custody_description": t, "redemption_mechanism": t, "transfer_policy_summary": "Testnet allowlist",
                "bridge_status": "none", "synthetic": true, "verification_status": "unverified"}})).await?;
            self.ok("add_evidence", json!({"subject_type": "representation", "subject_id": id, "evidence": evidence(symbol)})).await?;
            self.ok(
                "set_representation_status",
                json!({"id": id, "status": "active"}),
            )
            .await?;
        }
        self.ok("propose_compatibility", json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b",
            "classification": "DIRECT_EQUIVALENT", "ratio": {"num": RATIO_A_TO_B.to_string(), "den": "1"},
            "scope": "Parity conversion of synthetic test tokens", "rationale": "Test representations of one synthetic claim"})).await?;
        self.ok(
            "add_compatibility_evidence",
            json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b",
            "evidence": evidence("SYN-GOLD-OZ")}),
        )
        .await?;
        self.ok("approve_compatibility", json!({"representation_a_id": "tgold-a", "representation_b_id": "tgold-b", "rationale": "Reviewed"})).await?;
        let pk = near_workspaces::types::PublicKey::try_from_parts(
            near_workspaces::types::KeyType::ED25519,
            &self.signer.verifying_key().to_bytes(),
        )?;
        self.ok("set_quote_signer", json!({"public_key": pk.to_string()}))
            .await?;
        for rep in ["tgold-a", "tgold-b"] {
            self.ok("set_allowlist", json!({"representation_id": rep, "account_ids": [self.alice.id(), self.bob.id(), self.carol.id()], "allowed": true})).await?;
        }
        // Core must be registered on both tokens to hold them; alice and bob on both to trade.
        for token in [&self.token_a, &self.token_b] {
            for who in [self.core.id(), self.alice.id(), self.bob.id()] {
                self.register(token, who).await?;
            }
        }
        // carol is registered on A only, so a payout to her on B fails.
        self.register(&self.token_a, self.carol.id()).await?;
        Ok(())
    }
}
