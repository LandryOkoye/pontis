# Dossier: SYN-CARBON-ENG (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a carbon credit and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `canonical_asset_id`            | `syn-carbon-eng`                                                               |
| Name                            | Synthetic Engineered Removal Credit (1 tCO2e)                                  |
| Asset category                  | Synthetic carbon credit (test only)                                            |
| Underlying instrument or claim  | A fictional claim to one tonne of fictional engineered carbon removal.         |
| Unit definition                 | 1 canonical unit = 1 fictional tonne of carbon dioxide equivalent removed      |
| Currency / denomination         | USD, as a simulated price only                                                 |
| Economic rights                 | None. The claim confers no economic rights.                                    |
| Legal claim structure           | None. There is no plant, storage site, registry entry or retirement behind it. |
| Jurisdiction                    | None                                                                           |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                            |
| Valuation / NAV method          | Simulated price near 310 USD, a random walk of about 1.2% a day.               |
| Lifecycle model                 | Vintage 2026 in the fiction; retirement is narrative only.                     |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                   |
| Risk disclosures                | See below                                                                      |
| `synthetic`                     | `true`                                                                         |
| `verification_status`           | `unverified`                                                                   |
| Record status                   | `active` once registered with this evidence                                    |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Nothing was removed; the credit is a label.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A single wrapper from an issuer that was deprecated after its attestation lapsed: the token stays in the registry and cannot convert.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer               | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                        |
| -------------- | -------------------- | -------- | ---------------- | ---------------------------- | ------------- | ---------------------------------------------- |
| `tcbe-w`       | `wattlebird-capital` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [WATTLEBIRD-CAPITAL.md](WATTLEBIRD-CAPITAL.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tcbe-w`

| Field                | Value                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| Custodian (invented) | Mossgrove Carbon Registry Trustee (SIMULATED), `mossgrove-registry-sim`, BR |
| Structure            | `segregated`                                                                |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                         |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                        |
| Simulated cover      | 10300 bps of supply, signed by the public dev key                           |
| Seeded by            | `--catalogue=full`                                                          |
| Redemption terms     | none: not redeemable in this demo                                           |

This claim has one representation, so no relationship exists for it.
