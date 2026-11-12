# Dossier: SYN-MMF-USD (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a money-market fund and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-mmf-usd`                                                                     |
| Name                            | Synthetic USD Money-Market Fund unit                                              |
| Asset category                  | Synthetic money-market fund (test only)                                           |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional US dollar money-market fund.         |
| Unit definition                 | 1 canonical unit = 1 fictional fund unit with a nominal NAV of 1 USD at the start |
| Currency / denomination         | USD, as a simulated price only                                                    |
| Economic rights                 | None. The claim confers no economic rights.                                       |
| Legal claim structure           | None. There is no fund, manager, custodian or trust behind it.                    |
| Jurisdiction                    | None                                                                              |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                               |
| Valuation / NAV method          | Simulated NAV accruing about 4.4% a year; not a published NAV.                    |
| Lifecycle model                 | NAV fund with a daily strike in the fiction; one wrapper stands for ten units.    |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                      |
| Risk disclosures                | See below                                                                         |
| `synthetic`                     | `true`                                                                            |
| `verification_status`           | `unverified`                                                                      |
| Record status                   | `active` once registered with this evidence                                       |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- No fund stabilises the NAV; a real money-market fund can break its stable value.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

Two wrappers of one claim where one token is ten fund units, so the approved ratio is not a power of ten of the other's.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                  | Decimals | 1 whole token =   | Multiplier per smallest unit | Record status | Dossier                                              |
| -------------- | ----------------------- | -------- | ----------------- | ---------------------------- | ------------- | ---------------------------------------------------- |
| `tmmfusd-m`    | `merlion-harbour-trust` | 6        | 1 canonical unit  | `1 / 10^6`                   | `active`      | [MERLION-HARBOUR-TRUST.md](MERLION-HARBOUR-TRUST.md) |
| `tmmfusd-e`    | `emerald-tern-capital`  | 6        | 10 canonical unit | `1 / 10^5`                   | `active`      | [EMERALD-TERN-CAPITAL.md](EMERALD-TERN-CAPITAL.md)   |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tmmfusd-m`

| Field                | Value                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Custodian (invented) | Northquay Securities Custody (SIMULATED), `northquay-custody-sim`, LU                                                         |
| Structure            | `omnibus`                                                                                                                     |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                                                                           |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                                                                          |
| Simulated cover      | 10200 bps of supply, signed by the public dev key                                                                             |
| Seeded by            | `--catalogue=demo\|full`                                                                                                      |
| Redemption terms     | at least 1 and no maximum whole tokens, fee 10 bps, always open, issuer accepts within 1 d and settles within 1 d (simulated) |
| Simulated redemption | 40 whole tokens left `accepted` by the seed (the issuer is a test account; nothing is paid out)                               |

### `tmmfusd-e`

| Field                | Value                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Custodian (invented) | Calderwick Fund Custody (SIMULATED), `calderwick-fund-custody-sim`, IE                                                        |
| Structure            | `omnibus`                                                                                                                     |
| Reserve story        | `warn_only`: attested below supply, but the policy only warns: the status says `breached`, nothing is refused                 |
| Reserve policy       | `warn`, tolerance 0 bps, max age 1 d                                                                                          |
| Simulated cover      | 9700 bps of supply, signed by the public dev key                                                                              |
| Seeded by            | `--catalogue=full`                                                                                                            |
| Redemption terms     | at least 1 and no maximum whole tokens, fee 10 bps, always open, issuer accepts within 1 d and settles within 1 d (simulated) |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                      | Outcome                                         | Ratio    | Why                                                                                                |
| ------------------------- | ----------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `tmmfusd-e` : `tmmfusd-m` | DIRECT_EQUIVALENT, approved with a `fund` guard | `10 / 1` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. |
| `tmmfusd-m` : `ttb3m-m`   | ECONOMICALLY_SIMILAR, proposed only             | `1 / 1`  | Left proposed: ECONOMICALLY_SIMILAR never enables conversion.                                      |
