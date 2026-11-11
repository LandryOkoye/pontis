# Dossier: SYN-ART-CANVAS (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not an art or collectible and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-art-canvas`                                                                                                  |
| Name                            | Synthetic Canvas, Lantern Study No. 4 (unique work)                                                               |
| Asset category                  | Synthetic art or collectible (test only)                                                                          |
| Underlying instrument or claim  | A fictional claim to one fictional oil-on-canvas work, Lantern Study No. 4 by a fictional painter.                |
| Unit definition                 | 1 canonical unit = the whole fictional painting; the unit supply is 1                                             |
| Currency / denomination         | USD, as a simulated price only                                                                                    |
| Economic rights                 | None. The claim confers no economic rights.                                                                       |
| Legal claim structure           | None. There is no deed, provenance record, insurance or custody behind it.                                        |
| Jurisdiction                    | France (a real place, as a plain fact; the claim is fictional)                                                    |
| Redemption and settlement terms | None. The record cannot be redeemed, sold or fractionalised.                                                      |
| Valuation / NAV method          | Simulated appraisal series near 480,000 USD with one +5.5% step on 2026-10-22 (an auction estimate in the story). |
| Lifecycle model                 | Unique asset: one token with 0 decimals, never convertible, bridge-only.                                          |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                                                      |
| Risk disclosures                | See below                                                                                                         |
| `synthetic`                     | `true`                                                                                                            |
| `verification_status`           | `unverified`                                                                                                      |
| Record status                   | `active` once registered with this evidence                                                                       |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- A supply of one is not enforced against a second record of the same work.
- The appraisal is simulated; a real work has no continuous price.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A single indivisible record, like the phase 1 villa, from a Paris collections house. It is bridge-only: there is no parity partner.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                       | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                        |
| -------------- | ---------------------------- | -------- | ---------------- | ---------------------------- | ------------- | -------------------------------------------------------------- |
| `tart-m`       | `maison-quillon-collections` | 0        | 1 canonical unit | `1`                          | `active`      | [MAISON-QUILLON-COLLECTIONS.md](MAISON-QUILLON-COLLECTIONS.md) |

This claim has one representation, so no relationship exists for it.
