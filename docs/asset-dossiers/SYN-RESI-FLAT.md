# Dossier: SYN-RESI-FLAT (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a residential real estate and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-resi-flat`                                                                         |
| Name                            | Synthetic Apartment 4B record (unique property)                                         |
| Asset category                  | Synthetic residential real estate (test only)                                           |
| Underlying instrument or claim  | A fictional claim to one fictional apartment, flat 4B of a fictional building in Paris. |
| Unit definition                 | 1 canonical unit = the whole fictional apartment; the unit supply is 1                  |
| Currency / denomination         | USD, as a simulated price only                                                          |
| Economic rights                 | None. The claim confers no economic rights.                                             |
| Legal claim structure           | None. There is no deed, title register, co-ownership or company behind it.              |
| Jurisdiction                    | France (a real place, as a plain fact; the claim is fictional)                          |
| Redemption and settlement terms | None. The record cannot be redeemed, sold or fractionalised.                            |
| Valuation / NAV method          | Simulated appraisal series near 640,000 USD with one +0.6% step on 2026-09-30.          |
| Lifecycle model                 | Unique asset: one token with 0 decimals, never convertible, bridge-only.                |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                            |
| Risk disclosures                | See below                                                                               |
| `synthetic`                     | `true`                                                                                  |
| `verification_status`           | `unverified`                                                                            |
| Record status                   | `active` once registered with this evidence                                             |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- A supply of one is not enforced against a second record of the same work.
- The appraisal is simulated.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

Residential real estate as a single record, from the same house as the canvas. It is bridge-only: there is no parity partner.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                       | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                        |
| -------------- | ---------------------------- | -------- | ---------------- | ---------------------------- | ------------- | -------------------------------------------------------------- |
| `tflat-m`      | `maison-quillon-collections` | 0        | 1 canonical unit | `1`                          | `active`      | [MAISON-QUILLON-COLLECTIONS.md](MAISON-QUILLON-COLLECTIONS.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tflat-m`

No custody is recorded for `tflat-m`: the custody screens show their empty state, which is intended.

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Redemption terms | none: not redeemable in this demo |

This claim has one representation, so no relationship exists for it.
