# Dossier: MERIDIAN-ASSETS (issuer and its representations)

> **SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> Meridian Assets does not exist. It is a fictional applicant whose onboarding is still pending, so the demo catalogue shows a `restricted` issuer.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `meridian-assets`                                                                                  |
| Legal entity name                           | Meridian Assets (fictional; no legal entity)                                                       |
| Jurisdiction                                | None                                                                                               |
| Documentation                               | This dossier                                                                                       |
| Issuer status                               | `restricted`: registered, review pending, never activated                                          |
| Authorized asset categories                 | Tokenized equity (synthetic, test only)                                                            |
| Issuer-controlled contracts and admin roles | The two `synthetic-token` contracts below; the owner account controls mint, burn, pause and faucet |
| Custodian / service providers               | None                                                                                               |
| Audit / attestation providers               | None                                                                                               |
| Contact and incident information            | Pontis project team (testnet only)                                                                 |
| `synthetic` / `verification_status`         | `true` / `unverified`                                                                              |

## Representations issued

| Representation | Claim      | Decimals | 1 whole token =    | Multiplier per smallest unit | Record status |
| -------------- | ---------- | -------- | ------------------ | ---------------------------- | ------------- |
| `tacme-m`      | `syn-acme` | 8        | 0.1 canonical unit | `1 / 10^9`                   | `restricted`  |
| `tnova-m`      | `syn-nova` | 8        | 1 canonical unit   | `1 / 10^8`                   | `restricted`  |

Both: `synthetic` `true`, `verification_status` `unverified`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in `pontis-core`, no custody, backing or redemption, no bridge.

## Why everything here is `restricted`

The contract registers a representation for any existing issuer, but activates it only when the issuer is `active` ([ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), registry rules). The issuer was never activated, so neither representation can be. The relationship `tacme-h` / `tacme-m` is therefore proposed but cannot be approved (both representations must be active). The vault of neither token is funded.

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with the unit stated in the table.
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. The issuer is `unverified`: this dossier is attached as evidence, but no registrar has reviewed it or claimed more than that.
