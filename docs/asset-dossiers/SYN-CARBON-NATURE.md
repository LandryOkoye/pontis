# Dossier: SYN-CARBON-NATURE (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a carbon credit and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-carbon-nature`                                                                            |
| Name                            | Synthetic Nature-Based Carbon Credit (1 tCO2e)                                                 |
| Asset category                  | Synthetic carbon credit (test only)                                                            |
| Underlying instrument or claim  | A fictional claim to one tonne of fictional avoided emissions from a fictional forest project. |
| Unit definition                 | 1 canonical unit = 1 fictional tonne of carbon dioxide equivalent                              |
| Currency / denomination         | USD, as a simulated price only                                                                 |
| Economic rights                 | None. The claim confers no economic rights.                                                    |
| Legal claim structure           | None. There is no project, registry entry, buffer pool or retirement behind it.                |
| Jurisdiction                    | Brazil (a real place, as a plain fact; the claim is fictional)                                 |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                            |
| Valuation / NAV method          | Simulated price near 24.80 USD, about 2.5% a day, with a +6% step on 2026-09-15.               |
| Lifecycle model                 | Vintage 2025 in the fiction. Retirement is narrative: no token is burned to retire a credit.   |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                                   |
| Risk disclosures                | See below                                                                                      |
| `synthetic`                     | `true`                                                                                         |
| `verification_status`           | `unverified`                                                                                   |
| Record status                   | `active` once registered with this evidence                                                    |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- A real credit can be reversed or double counted; nothing here is registered or retired.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A forest credit from a Brazilian originator, also wrapped by an Emirati trader with three decimals.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                     | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                    |
| -------------- | -------------------------- | -------- | ---------------- | ---------------------------- | ------------- | ---------------------------------------------------------- |
| `tcbn-v`       | `verde-amazonas-ativos`    | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [VERDE-AMAZONAS-ATIVOS.md](VERDE-AMAZONAS-ATIVOS.md)       |
| `tcbn-d`       | `saffron-crescent-capital` | 3        | 1 canonical unit | `1 / 10^3`                   | `active`      | [SAFFRON-CRESCENT-CAPITAL.md](SAFFRON-CRESCENT-CAPITAL.md) |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                | Outcome                                              | Ratio      | Why                                                                                                |
| ------------------- | ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `tcbn-d` : `tcbn-v` | DIRECT_EQUIVALENT, approved with a `commodity` guard | `1000 / 1` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. |
