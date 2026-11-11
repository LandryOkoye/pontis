# Dossier: SYN-NOTE-TRADE (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a private-credit note and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-note-trade`                                                                                                                                                                                    |
| Name                            | Synthetic Trade-Receivables Note 2026-12 (redemption-gated)                                                                                                                                         |
| Asset category                  | Synthetic private-credit note (test only)                                                                                                                                                           |
| Underlying instrument or claim  | A fictional claim to one fictional note of 100 USD nominal backed, in the story, by fictional trade invoices.                                                                                       |
| Unit definition                 | 1 canonical unit = 1 fictional note of 100 USD nominal                                                                                                                                              |
| Currency / denomination         | USD, as a simulated NAV only                                                                                                                                                                        |
| Economic rights                 | None. The claim confers no payment rights.                                                                                                                                                          |
| Legal claim structure           | None. There is no borrower, loan agreement, security or trustee.                                                                                                                                    |
| Jurisdiction                    | Canada (a real place, as a plain fact; the claim is fictional)                                                                                                                                      |
| Redemption and settlement terms | Narrative only: maturity 2026-12-18; redemption opens only after maturity and only if the issuer's liquidity condition holds (a redemption gate). Nothing checks the condition and nothing redeems. |
| Valuation / NAV method          | Simulated NAV accruing about 6.2% a year toward maturity; not a valuation.                                                                                                                          |
| Lifecycle model                 | Term instrument with maturity 2026-12-18 in the fiction and a redemption gate; the gate is a story, not a mechanism.                                                                                |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                                                                                                                                        |
| Risk disclosures                | See below                                                                                                                                                                                           |
| `synthetic`                     | `true`                                                                                                                                                                                              |
| `verification_status`           | `unverified`                                                                                                                                                                                        |
| Record status                   | `active` once registered with this evidence                                                                                                                                                         |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- The redemption gate is text: no contract opens or closes a window, and no exit exists (phase 4 adds redemption).
- A real gated note can leave holders unable to exit for long periods.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

The demo's redemption-gated note: the dossier says holders may not redeem on demand. Phase 4 (custody and redemption) is where a gate could become real.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                          |
| -------------- | --------------------- | -------- | ---------------- | ---------------------------- | ------------- | ------------------------------------------------ |
| `ttrd-b`       | `boreal-larch-credit` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [BOREAL-LARCH-CREDIT.md](BOREAL-LARCH-CREDIT.md) |

This claim has one representation, so no relationship exists for it.
