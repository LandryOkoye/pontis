# Dossier: SYN-RESI-RENTAL (canonical claim)

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
| `canonical_asset_id`            | `syn-resi-rental`                                                                       |
| Name                            | Synthetic Residential Rental Portfolio unit                                             |
| Asset category                  | Synthetic residential real estate (test only)                                           |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional portfolio of rented flats.                 |
| Unit definition                 | 1 canonical unit = 1 fictional portfolio unit priced near 58 USD at the start           |
| Currency / denomination         | USD, as a simulated price only                                                          |
| Economic rights                 | None. The claim confers no economic rights.                                             |
| Legal claim structure           | None. There is no portfolio, tenancy, deed or trust behind it.                          |
| Jurisdiction                    | Germany (a real place, as a plain fact; the claim is fictional)                         |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                     |
| Valuation / NAV method          | Simulated appraisal-driven price: nearly flat with one +0.9% reappraisal on 2026-09-30. |
| Lifecycle model                 | Open-ended unit with quarterly appraisals in the fiction.                               |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                            |
| Risk disclosures                | See below                                                                               |
| `synthetic`                     | `true`                                                                                  |
| `verification_status`           | `unverified`                                                                            |
| Record status                   | `active` once registered with this evidence                                             |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Rent is not modelled: the unit pays nothing.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

Residential real estate as a fund unit: divisible, in contrast to the single-flat record.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                          |
| -------------- | --------------------- | -------- | ---------------- | ---------------------------- | ------------- | ------------------------------------------------ |
| `tresi-r`      | `rheinkontor-digital` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [RHEINKONTOR-DIGITAL.md](RHEINKONTOR-DIGITAL.md) |

This claim has one representation, so no relationship exists for it.
