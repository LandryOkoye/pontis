# Dossier: SYN-USTB (canonical claim)

> **SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a fund and holds no Treasury bills. It exists only so the demo catalogue has a NAV-style fund example on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md), [ADR 0015](../decisions/0015-market-data-platform.md)

## Record

| Field                           | Value                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-ustb`                                                                              |
| Name                            | Synthetic Treasury Bill Fund unit                                                       |
| Asset category                  | Synthetic Treasury fund (test only)                                                     |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional money-market fund that holds US Treasuries |
| Unit definition                 | 1 canonical unit = 1 fictional fund unit with a nominal NAV of 1 USD at the start       |
| Currency / denomination         | USD, as a simulated NAV only                                                            |
| Economic rights                 | None. A real fund unit would accrue income; this claim confers no rights.               |
| Legal claim structure           | None. There is no fund, manager, custodian or trust behind it.                          |
| Jurisdiction                    | None                                                                                    |
| Redemption and settlement terms | None. The claim cannot be redeemed at NAV or at any other price.                        |
| Valuation / NAV method          | Simulated NAV accruing about 4.5% a year (`apps/simulator`); not a published NAV        |
| Lifecycle model                 | None on chain                                                                           |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime                             |
| Risk disclosures                | See below                                                                               |
| `synthetic`                     | `true`                                                                                  |
| `verification_status`           | `unverified`                                                                            |
| Record status                   | `active` once registered with this evidence                                             |

## Risk disclosures

- Nothing is held, invested or redeemable. The NAV and the market price are both simulated.
- A NAV that rises smoothly is a property of the simulator, not evidence of any return.
- Do not infer that any real fund token is equivalent to anything here.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer               | Unit                       | Dossier                                        |
| -------------- | -------------------- | -------------------------- | ---------------------------------------------- |
| `tustb-h`      | `halcyon-securities` | 1 token = 1 canonical unit | [HALCYON-SECURITIES.md](HALCYON-SECURITIES.md) |
| `tustb-o`      | `orchard-trust`      | 1 token = 1 canonical unit | [ORCHARD-TRUST.md](ORCHARD-TRUST.md)           |

A shared `canonical_asset_id` is a candidate association only. The pair is approved as `DIRECT_EQUIVALENT` by the project operator for the demo, with the ratio derived from the unit multipliers: `tustb-h` has 6 decimals and `tustb-o` has 8, so one whole token of each is one canonical unit and the approved smallest-unit ratio is `100 / 1`. The approval does not make `tustb-o` executable: its issuer is `deprecated` ([ADR 0004](../decisions/0004-compatibility-and-policy-versioning.md)).
