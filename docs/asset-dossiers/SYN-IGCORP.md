# Dossier: SYN-IGCORP (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not an investment-grade bond fund and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-igcorp`                                                                           |
| Name                            | Synthetic Investment-Grade Corporate Bond Fund unit                                    |
| Asset category                  | Synthetic investment-grade bond fund (test only)                                       |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional fund of investment-grade corporate bonds. |
| Unit definition                 | 1 canonical unit = 1 fictional fund unit priced near 100 USD at the start              |
| Currency / denomination         | USD, as a simulated price only                                                         |
| Economic rights                 | None. The claim confers no economic rights.                                            |
| Legal claim structure           | None. There is no fund, manager, custodian or trust behind it.                         |
| Jurisdiction                    | None                                                                                   |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                    |
| Valuation / NAV method          | Simulated market price, a slow random walk with a little drift; not a NAV.             |
| Lifecycle model                 | Open-ended fund unit priced by the market in the fiction; no strike.                   |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                           |
| Risk disclosures                | See below                                                                              |
| `synthetic`                     | `true`                                                                                 |
| `verification_status`           | `unverified`                                                                           |
| Record status                   | `active` once registered with this evidence                                            |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Credit and duration risk of a real bond fund are not modelled.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A bond fund wrapped by a Luxembourg and a German issuer; the pair is guarded.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                    | Decimals | 1 whole token =       | Multiplier per smallest unit | Record status | Dossier                                                  |
| -------------- | ------------------------- | -------- | --------------------- | ---------------------------- | ------------- | -------------------------------------------------------- |
| `tigc-c`       | `cobaltine-fund-services` | 6        | 1 canonical unit      | `1 / 10^6`                   | `active`      | [COBALTINE-FUND-SERVICES.md](COBALTINE-FUND-SERVICES.md) |
| `tigc-r`       | `rheinkontor-digital`     | 8        | 1 / 10 canonical unit | `1 / 10^9`                   | `active`      | [RHEINKONTOR-DIGITAL.md](RHEINKONTOR-DIGITAL.md)         |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tigc-c`

| Field                | Value                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Custodian (invented) | Northquay Securities Custody (SIMULATED), `northquay-custody-sim`, LU                                                              |
| Structure            | `segregated`                                                                                                                       |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                                                                                |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                                                                               |
| Simulated cover      | 10150 bps of supply, signed by the public dev key                                                                                  |
| Seeded by            | `--catalogue=full`                                                                                                                 |
| Redemption terms     | at least 10 and at most 100000 whole tokens, fee 40 bps, always open, issuer accepts within 1 d and settles within 3 d (simulated) |

### `tigc-r`

| Field                | Value                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Custodian (invented) | Calderwick Fund Custody (SIMULATED), `calderwick-fund-custody-sim`, IE                                                            |
| Structure            | `omnibus`                                                                                                                         |
| Reserve story        | `pause_mint`: the policy action is `pause_mint`: a breach would also stop gated mints                                             |
| Reserve policy       | `pause_mint`, tolerance 50 bps, max age 1 d                                                                                       |
| Simulated cover      | 10100 bps of supply, signed by the public dev key                                                                                 |
| Seeded by            | `--catalogue=full`                                                                                                                |
| Redemption terms     | at least 10 and at most 50000 whole tokens, fee 40 bps, always open, issuer accepts within 1 d and settles within 3 d (simulated) |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                | Outcome                                         | Ratio      | Why                                                                                                |
| ------------------- | ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `tigc-c` : `tigc-r` | DIRECT_EQUIVALENT, approved with a `fund` guard | `1000 / 1` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. |
