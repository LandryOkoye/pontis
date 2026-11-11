# Dossier: SYN-ACME (canonical claim)

> **SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> Acme Corp does not exist. This claim corresponds to no share, register, custodian or legal right. It exists only so the demo catalogue has a tokenized-equity example on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md), [ADR 0015](../decisions/0015-market-data-platform.md)

## Record

| Field                           | Value                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-acme`                                                                          |
| Name                            | Synthetic Acme Corp ordinary share                                                  |
| Asset category                  | Synthetic tokenized equity (test only)                                              |
| Underlying instrument or claim  | A fictional claim to one ordinary share of Acme Corp, a fictional listed company    |
| Unit definition                 | 1 canonical unit = 1 fictional Acme Corp ordinary share                             |
| Currency / denomination         | USD, as a simulated price only                                                      |
| Economic rights                 | None. A real share would carry dividend and voting rights; this claim confers none. |
| Legal claim structure           | None. There is no company, share register, trust or contract behind it.             |
| Jurisdiction                    | None                                                                                |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                 |
| Valuation / NAV method          | Simulated price feed (`apps/simulator`); not a market price                         |
| Lifecycle model                 | None on chain. The simulated price series includes a fictional cash dividend jump.  |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime                         |
| Risk disclosures                | See below                                                                           |
| `synthetic`                     | `true`                                                                              |
| `verification_status`           | `unverified`                                                                        |
| Record status                   | `active` once registered with this evidence                                         |

## Risk disclosures

- The claim is not backed by any asset, and the prices shown for it are simulated.
- A fictional dividend appears as a price step in the simulated series. No dividend is paid and nothing on chain models corporate actions.
- Do not infer that any real token or ticker with a similar name is equivalent to anything here.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer               | Unit                         | Dossier                                        |
| -------------- | -------------------- | ---------------------------- | ---------------------------------------------- |
| `tacme-h`      | `halcyon-securities` | 1 token = 1 canonical unit   | [HALCYON-SECURITIES.md](HALCYON-SECURITIES.md) |
| `tacme-m`      | `meridian-assets`    | 1 token = 0.1 canonical unit | [MERIDIAN-ASSETS.md](MERIDIAN-ASSETS.md)       |

A shared `canonical_asset_id` is a candidate association only. The relationship between the two is proposed as `DIRECT_EQUIVALENT` and is not approved, because `tacme-m` cannot be activated while its issuer is `restricted` ([ADR 0004](../decisions/0004-compatibility-and-policy-versioning.md)).
