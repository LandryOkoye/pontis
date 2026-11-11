# Dossier: SYN-CRE-LOGISTICS (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a commercial real-estate fund and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-cre-logistics`                                                                     |
| Name                            | Synthetic Logistics Property Fund unit                                                  |
| Asset category                  | Synthetic commercial real-estate fund (test only)                                       |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional fund of fictional warehouses.              |
| Unit definition                 | 1 canonical unit = 1 fictional fund unit priced near 124.50 USD at the start            |
| Currency / denomination         | USD, as a simulated price only                                                          |
| Economic rights                 | None. The claim confers no economic rights.                                             |
| Legal claim structure           | None. There is no fund, property, deed or trust behind it.                              |
| Jurisdiction                    | None                                                                                    |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                     |
| Valuation / NAV method          | Simulated appraisal-driven price: nearly flat with one +1.4% reappraisal on 2026-09-30. |
| Lifecycle model                 | Open-ended property fund unit with quarterly appraisals in the fiction.                 |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                            |
| Risk disclosures                | See below                                                                               |
| `synthetic`                     | `true`                                                                                  |
| `verification_status`           | `unverified`                                                                            |
| Record status                   | `active` once registered with this evidence                                             |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Real property funds are valued by appraisal and gate redemptions; none of that exists.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

Wrapped by a German manager and a Cayman sponsor. The pair was approved while the sponsor was active; the sponsor is now restricted, so it does not convert.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                      | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                      |
| -------------- | --------------------------- | -------- | ---------------- | ---------------------------- | ------------- | ------------------------------------------------------------ |
| `tcrel-r`      | `rheinkontor-digital`       | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [RHEINKONTOR-DIGITAL.md](RHEINKONTOR-DIGITAL.md)             |
| `tcrel-t`      | `kittiwake-cayman-partners` | 8        | 1 canonical unit | `1 / 10^8`                   | `active`      | [KITTIWAKE-CAYMAN-PARTNERS.md](KITTIWAKE-CAYMAN-PARTNERS.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tcrel-r`

| Field                | Value                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| Custodian (invented) | Wexcombe Property SPV Registry (SIMULATED), `wexcombe-spv-registry-sim`, DE |
| Structure            | `segregated`                                                                |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                         |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                        |
| Simulated cover      | 10050 bps of supply, signed by the public dev key                           |
| Seeded by            | `--catalogue=full`                                                          |
| Redemption terms     | none: not redeemable in this demo                                           |

### `tcrel-t`

| Field                | Value                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| Custodian (invented) | Wexcombe Property SPV Registry (SIMULATED), `wexcombe-spv-registry-sim`, DE |
| Structure            | `segregated`                                                                |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                         |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                        |
| Simulated cover      | 10000 bps of supply, signed by the public dev key                           |
| Seeded by            | `--catalogue=full`                                                          |
| Redemption terms     | none: not redeemable in this demo                                           |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                  | Outcome                                             | Ratio     | Why                                                                                                                                 |
| --------------------- | --------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tcrel-r` : `tcrel-t` | DIRECT_EQUIVALENT, approved with a `illiquid` guard | `100 / 1` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. The issuer was restricted later. |
