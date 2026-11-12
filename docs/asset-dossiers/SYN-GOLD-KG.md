# Dossier: SYN-GOLD-KG (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a precious-metal claim and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `canonical_asset_id`            | `syn-gold-kg`                                                                  |
| Name                            | Synthetic Gold, one kilogram bar                                               |
| Asset category                  | Synthetic precious-metal claim (test only)                                     |
| Underlying instrument or claim  | A fictional claim to one kilogram of fictional allocated gold.                 |
| Unit definition                 | 1 canonical unit = 1 fictional kilogram of fictional gold                      |
| Currency / denomination         | USD, as a simulated price only                                                 |
| Economic rights                 | None. The claim confers no economic rights.                                    |
| Legal claim structure           | None. There is no vault, bar, custodian or warehouse receipt behind it.        |
| Jurisdiction                    | Switzerland (a real place, as a plain fact; the claim is fictional)            |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                            |
| Valuation / NAV method          | Simulated price near 85,300 USD per kilogram, a random walk of about 1% a day. |
| Lifecycle model                 | Commodity claim; no strike, no maturity, no redemption.                        |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                   |
| Risk disclosures                | See below                                                                      |
| `synthetic`                     | `true`                                                                         |
| `verification_status`           | `unverified`                                                                   |
| Record status                   | `active` once registered with this evidence                                    |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Parity conversion says nothing about price, bar quality or storage.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

Gold sold by the kilogram. One wrapper is a whole-bar token and the other is one gram per token with four decimals, so the pair's ratio is 10 to 1 in smallest units.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                     | Decimals | 1 whole token =         | Multiplier per smallest unit | Record status | Dossier                                                    |
| -------------- | -------------------------- | -------- | ----------------------- | ---------------------------- | ------------- | ---------------------------------------------------------- |
| `tgkg-a`       | `alpenrose-fiduciary`      | 6        | 1 canonical unit        | `1 / 10^6`                   | `active`      | [ALPENROSE-FIDUCIARY.md](ALPENROSE-FIDUCIARY.md)           |
| `tgkg-d`       | `saffron-crescent-capital` | 4        | 1 / 1000 canonical unit | `1 / 10^7`                   | `active`      | [SAFFRON-CRESCENT-CAPITAL.md](SAFFRON-CRESCENT-CAPITAL.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tgkg-a`

| Field                | Value                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Custodian (invented) | Lindenhall Vault Services (SIMULATED), `lindenhall-vaults-sim`, CH                                                              |
| Structure            | `segregated`                                                                                                                    |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                                                                             |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                                                                            |
| Simulated cover      | 10500 bps of supply, signed by the public dev key                                                                               |
| Seeded by            | `--catalogue=demo\|full`                                                                                                        |
| Redemption terms     | at least 1 and at most 1000 whole tokens, fee 50 bps, always open, issuer accepts within 2 d and settles within 3 d (simulated) |
| Simulated redemption | 5 whole tokens left `requested` by the seed (the issuer is a test account; nothing is paid out)                                 |

### `tgkg-d`

| Field                | Value                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Custodian (invented) | Orrinvale Bullion Storage (SIMULATED), `orrinvale-bullion-sim`, SG                                                                        |
| Structure            | `omnibus`                                                                                                                                 |
| Reserve story        | `breached`: attested below supply and the tolerance: the route is restricted (`reserve_restricted`) while it lasts                        |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                                                                                      |
| Simulated cover      | 9200 bps of supply, signed by the public dev key                                                                                          |
| Seeded by            | `--catalogue=demo\|full`                                                                                                                  |
| Redemption terms     | at least 1 and at most 500 whole tokens, fee 60 bps, open 3 d in every 30 d, issuer accepts within 2 d and settles within 3 d (simulated) |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                | Outcome                                              | Ratio    | Why                                                                                                |
| ------------------- | ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `tgkg-a` : `tgkg-d` | DIRECT_EQUIVALENT, approved with a `commodity` guard | `10 / 1` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. |
