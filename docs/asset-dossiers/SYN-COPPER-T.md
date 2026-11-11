# Dossier: SYN-COPPER-T (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not an industrial commodity claim and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-copper-t`                                                               |
| Name                            | Synthetic Copper, one tonne                                                  |
| Asset category                  | Synthetic industrial commodity claim (test only)                             |
| Underlying instrument or claim  | A fictional claim to one tonne of fictional refined copper.                  |
| Unit definition                 | 1 canonical unit = 1 fictional tonne of fictional copper                     |
| Currency / denomination         | USD, as a simulated price only                                               |
| Economic rights                 | None. The claim confers no economic rights.                                  |
| Legal claim structure           | None. There is no warehouse, brand or warrant behind it.                     |
| Jurisdiction                    | None                                                                         |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                          |
| Valuation / NAV method          | Simulated price near 9,450 USD per tonne, a random walk of about 1.4% a day. |
| Lifecycle model                 | Commodity claim; no strike, no maturity, no redemption.                      |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                 |
| Risk disclosures                | See below                                                                    |
| `synthetic`                     | `true`                                                                       |
| `verification_status`           | `unverified`                                                                 |
| Record status                   | `active` once registered with this evidence                                  |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- No metal is held; a real warehouse receipt has counterparty and storage risk.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

Copper wrapped by an Emirati house and an Australian trader whose attestation lapsed; the approved pair is blocked.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                     | Decimals | 1 whole token =       | Multiplier per smallest unit | Record status | Dossier                                                    |
| -------------- | -------------------------- | -------- | --------------------- | ---------------------------- | ------------- | ---------------------------------------------------------- |
| `tcu-d`        | `saffron-crescent-capital` | 6        | 1 canonical unit      | `1 / 10^6`                   | `active`      | [SAFFRON-CRESCENT-CAPITAL.md](SAFFRON-CRESCENT-CAPITAL.md) |
| `tcu-w`        | `wattlebird-capital`       | 8        | 1 / 10 canonical unit | `1 / 10^9`                   | `active`      | [WATTLEBIRD-CAPITAL.md](WATTLEBIRD-CAPITAL.md)             |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair              | Outcome                                              | Ratio      | Why                                                                                                                                 |
| ----------------- | ---------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tcu-d` : `tcu-w` | DIRECT_EQUIVALENT, approved with a `commodity` guard | `1000 / 1` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. The issuer was deprecated later. |
