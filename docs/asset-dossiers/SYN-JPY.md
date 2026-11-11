# Dossier: SYN-JPY (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a stable-value token and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                       |
| ------------------------------- | --------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-jpy`                                                                   |
| Name                            | Synthetic Yen                                                               |
| Asset category                  | Synthetic stable-value token (test only)                                    |
| Underlying instrument or claim  | A fictional claim to one yen.                                               |
| Unit definition                 | 1 canonical unit = 1 fictional yen                                          |
| Currency / denomination         | JPY, shown in USD at a simulated 0.0066 per yen only                        |
| Economic rights                 | None. The claim confers no economic rights.                                 |
| Legal claim structure           | None. There is no reserve, issuer obligation or bank account.               |
| Jurisdiction                    | None                                                                        |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                         |
| Valuation / NAV method          | Simulated price reverting to 0.0066 USD per yen; a peg in the fiction only. |
| Lifecycle model                 | Stable-value token; no strike, no maturity.                                 |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                |
| Risk disclosures                | See below                                                                   |
| `synthetic`                     | `true`                                                                      |
| `verification_status`           | `unverified`                                                                |
| Record status                   | `active` once registered with this evidence                                 |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Nothing backs the peg. Eight-decimal prices make a yen token's price coarse in the simulator.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A yen stable-value token in two wrappers: one token is one yen, the other is one hundred yen. One issuer is unverified.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                  | Decimals | 1 whole token =    | Multiplier per smallest unit | Record status | Dossier                                              |
| -------------- | ----------------------- | -------- | ------------------ | ---------------------------- | ------------- | ---------------------------------------------------- |
| `tjpy-s`       | `sakura-meadow-trust`   | 2        | 1 canonical unit   | `1 / 10^2`                   | `active`      | [SAKURA-MEADOW-TRUST.md](SAKURA-MEADOW-TRUST.md)     |
| `tjpy-m`       | `merlion-harbour-trust` | 6        | 100 canonical unit | `1 / 10^4`                   | `active`      | [MERLION-HARBOUR-TRUST.md](MERLION-HARBOUR-TRUST.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tjpy-s`

No custody is recorded for `tjpy-s`: the custody screens show their empty state, which is intended.

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Redemption terms | none: not redeemable in this demo |

### `tjpy-m`

| Field                | Value                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Custodian (invented) | Tamarisk Reserve Trust (SIMULATED), `tamarisk-reserve-trust-sim`, KY |
| Structure            | `segregated`                                                         |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                  |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                 |
| Simulated cover      | 10200 bps of supply, signed by the public dev key                    |
| Seeded by            | `--catalogue=full`                                                   |
| Redemption terms     | none: not redeemable in this demo                                    |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                | Outcome                                           | Ratio     | Why                                                                                                |
| ------------------- | ------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `tjpy-m` : `tjpy-s` | DIRECT_EQUIVALENT, approved with a `stable` guard | `1 / 100` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. |
