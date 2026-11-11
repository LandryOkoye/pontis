# Dossier: SYN-MMF-EUR (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a money-market fund and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-mmf-eur`                                                                     |
| Name                            | Synthetic EUR Money-Market Fund unit                                              |
| Asset category                  | Synthetic money-market fund (test only)                                           |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional euro money-market fund.              |
| Unit definition                 | 1 canonical unit = 1 fictional fund unit with a nominal NAV of 1 EUR at the start |
| Currency / denomination         | EUR, shown in USD at a simulated 1.085 only                                       |
| Economic rights                 | None. The claim confers no economic rights.                                       |
| Legal claim structure           | None. There is no fund, manager, custodian or trust behind it.                    |
| Jurisdiction                    | None                                                                              |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                               |
| Valuation / NAV method          | Simulated NAV accruing about 2.6% a year; not a published NAV.                    |
| Lifecycle model                 | NAV fund with a daily strike in the fiction.                                      |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                      |
| Risk disclosures                | See below                                                                         |
| `synthetic`                     | `true`                                                                            |
| `verification_status`           | `unverified`                                                                      |
| Record status                   | `active` once registered with this evidence                                       |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- The euro rate is fixed in the simulator and says nothing about any exchange rate.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

Two wrappers whose proposed parity pair was rejected: the reviewer in the story found the second issuer's evidence did not state its fee schedule.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                    | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                  |
| -------------- | ------------------------- | -------- | ---------------- | ---------------------------- | ------------- | -------------------------------------------------------- |
| `tmmfeur-e`    | `emerald-tern-capital`    | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [EMERALD-TERN-CAPITAL.md](EMERALD-TERN-CAPITAL.md)       |
| `tmmfeur-c`    | `cobaltine-fund-services` | 8        | 1 canonical unit | `1 / 10^8`                   | `active`      | [COBALTINE-FUND-SERVICES.md](COBALTINE-FUND-SERVICES.md) |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                      | Outcome                     | Ratio     | Why                                                                                                                                         |
| ------------------------- | --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tmmfeur-c` : `tmmfeur-e` | DIRECT_EQUIVALENT, rejected | `1 / 100` | Rejected: in the story the reviewer found that tmmfeur-c's evidence does not state its fee schedule. A rejected pair can be proposed again. |
