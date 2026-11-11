# Dossier: SYN-CREDIT (canonical claim)

> **SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> No borrower, loan, note or cash flow exists. The maturity and redemption terms below are a narrative so the demo catalogue has a private-credit example; none of it is implemented anywhere.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md), [ADR 0015](../decisions/0015-market-data-platform.md)

## Record

| Field                           | Value                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-credit`                                                                                  |
| Name                            | Synthetic Private Credit Note 2028                                                            |
| Asset category                  | Synthetic private-credit note (test only)                                                     |
| Underlying instrument or claim  | A fictional senior note issued by a fictional borrower, "Larkspur Logistics"                  |
| Unit definition                 | 1 canonical unit = 1 fictional note of 100 USD nominal                                        |
| Currency / denomination         | USD, as a simulated NAV only                                                                  |
| Economic rights                 | None. A real note would pay interest and principal; this claim confers no payment rights.     |
| Legal claim structure           | None. There is no borrower, loan agreement, security or trustee behind it.                    |
| Jurisdiction                    | None                                                                                          |
| Redemption and settlement terms | Narrative: maturity 2028-03-31, redemption at nominal plus accrued interest. Not implemented. |
| Valuation / NAV method          | Simulated NAV accruing about 7% a year toward maturity (`apps/simulator`)                     |
| Lifecycle model                 | None on chain. Maturity and redemption are not modelled by any contract.                      |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime                                   |
| Risk disclosures                | See below                                                                                     |
| `synthetic`                     | `true`                                                                                        |
| `verification_status`           | `unverified`                                                                                  |
| Record status                   | `active` once registered with this evidence                                                   |

## Risk disclosures

- The note is not backed by any loan, and the NAV and prices shown for it are simulated.
- The maturity date and redemption terms are text. Nothing happens on 2028-03-31, and no contract pays out or burns anything.
- A smoothly accruing NAV is a property of the simulator. A real private-credit note carries default, liquidity and valuation risk that is not modelled here.
- Do not infer that any real credit token is equivalent to anything here.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multiplier of `tcredit-1` (1 token = 1 canonical unit).
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No loan, custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer               | Unit                       | Dossier                                        |
| -------------- | -------------------- | -------------------------- | ---------------------------------------------- |
| `tcredit-1`    | `halcyon-securities` | 1 token = 1 canonical unit | [HALCYON-SECURITIES.md](HALCYON-SECURITIES.md) |

`vantage-credit` applied to issue notes in this category and was rejected ([VANTAGE-CREDIT.md](VANTAGE-CREDIT.md)); it has no representation.
