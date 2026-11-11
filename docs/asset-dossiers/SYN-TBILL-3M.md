# Dossier: SYN-TBILL-3M (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a treasury fund and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-tbill-3m`                                                                                                                                                                            |
| Name                            | Synthetic 3-Month Treasury Bill Fund unit                                                                                                                                                 |
| Asset category                  | Synthetic Treasury fund (test only)                                                                                                                                                       |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional fund that rolls three-month US Treasury bills.                                                                                               |
| Unit definition                 | 1 canonical unit = 1 fictional fund unit with a nominal NAV of 1 USD at the start                                                                                                         |
| Currency / denomination         | USD, as a simulated price only                                                                                                                                                            |
| Economic rights                 | None. The claim confers no economic rights.                                                                                                                                               |
| Legal claim structure           | None. There is no fund, manager, custodian or trust behind it.                                                                                                                            |
| Jurisdiction                    | None                                                                                                                                                                                      |
| Redemption and settlement terms | None. The claim cannot be redeemed at the NAV or at any other price.                                                                                                                      |
| Valuation / NAV method          | Simulated NAV accruing about 4.3% a year; not a published NAV.                                                                                                                            |
| Lifecycle model                 | NAV fund with a daily strike at 16:00 UTC in the fiction. No strike is published: the simulator writes a NAV every five minutes and an operator may sign one for the contract (ADR 0018). |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                                                                                                                              |
| Risk disclosures                | See below                                                                                                                                                                                 |
| `synthetic`                     | `true`                                                                                                                                                                                    |
| `verification_status`           | `unverified`                                                                                                                                                                              |
| Record status                   | `active` once registered with this evidence                                                                                                                                               |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- A smoothly rising NAV is a property of the simulator, not evidence of any return.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

The flagship short-dated treasury fund of the demo, wrapped by two different issuers with different decimals so a parity pair exists.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                  | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                              |
| -------------- | ----------------------- | -------- | ---------------- | ---------------------------- | ------------- | ---------------------------------------------------- |
| `ttb3m-m`      | `merlion-harbour-trust` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [MERLION-HARBOUR-TRUST.md](MERLION-HARBOUR-TRUST.md) |
| `ttb3m-e`      | `emerald-tern-capital`  | 8        | 1 canonical unit | `1 / 10^8`                   | `active`      | [EMERALD-TERN-CAPITAL.md](EMERALD-TERN-CAPITAL.md)   |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `ttb3m-m`

| Field                | Value                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Custodian (invented) | Northquay Securities Custody (SIMULATED), `northquay-custody-sim`, LU                                                          |
| Structure            | `segregated`                                                                                                                   |
| Reserve story        | `thin`: attested a little below supply but inside the tolerance: `ok`, with no headroom                                        |
| Reserve policy       | `restrict_conversions`, tolerance 100 bps, max age 1 d                                                                         |
| Simulated cover      | 9950 bps of supply, signed by the public dev key                                                                               |
| Seeded by            | `--catalogue=demo\|full`                                                                                                       |
| Redemption terms     | at least 10 and no maximum whole tokens, fee 25 bps, always open, issuer accepts within 1 d and settles within 2 d (simulated) |
| Simulated redemption | 25 whole tokens left `fulfilled` by the seed (the issuer is a test account; nothing is paid out)                               |

### `ttb3m-e`

| Field                | Value                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Custodian (invented) | Calderwick Fund Custody (SIMULATED), `calderwick-fund-custody-sim`, IE                                                         |
| Structure            | `segregated`                                                                                                                   |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                                                                            |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                                                                           |
| Simulated cover      | 10100 bps of supply, signed by the public dev key                                                                              |
| Seeded by            | `--catalogue=full`                                                                                                             |
| Redemption terms     | at least 10 and no maximum whole tokens, fee 25 bps, always open, issuer accepts within 1 d and settles within 2 d (simulated) |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                  | Outcome                                         | Ratio     | Why                                                                                                |
| --------------------- | ----------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `ttb3m-e` : `ttb3m-m` | DIRECT_EQUIVALENT, approved with a `fund` guard | `1 / 100` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. |
