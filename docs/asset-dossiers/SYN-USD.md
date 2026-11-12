# Dossier: SYN-USD (canonical claim)

> **SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a stablecoin and nothing stands behind it. It exists only so the demo catalogue has a dollar-pegged quote asset on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md), [ADR 0015](../decisions/0015-market-data-platform.md)

## Record

| Field                           | Value                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-usd`                                                                        |
| Name                            | Synthetic Dollar                                                                 |
| Asset category                  | Synthetic dollar-pegged quote asset (test only)                                  |
| Underlying instrument or claim  | A fictional claim to one US dollar                                               |
| Unit definition                 | 1 canonical unit = 1 fictional US dollar                                         |
| Currency / denomination         | USD, as a simulated price only                                                   |
| Economic rights                 | None. A real dollar token would be redeemable for dollars; this one is not.      |
| Legal claim structure           | None. There is no reserve, issuer obligation, bank account or trust behind it.   |
| Jurisdiction                    | None                                                                             |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                              |
| Valuation / NAV method          | Simulated price reverting to 1 USD (`apps/simulator`); a peg in the fiction only |
| Lifecycle model                 | None                                                                             |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime                      |
| Risk disclosures                | See below                                                                        |
| `synthetic`                     | `true`                                                                           |
| `verification_status`           | `unverified`                                                                     |
| Record status                   | `active` once registered with this evidence                                      |

## Risk disclosures

- Nothing backs the peg. The simulator pulls the price toward 1 USD; no reserve or redemption does.
- A real dollar-pegged token can lose its peg and has issuer, reserve and regulatory risk that is not modelled here.
- Do not infer that any real stablecoin is equivalent to anything here.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multiplier of `tusd-h` (1 token = 1 canonical unit).
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No reserve, custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer               | Unit                       | Dossier                                        |
| -------------- | -------------------- | -------------------------- | ---------------------------------------------- |
| `tusd-h`       | `halcyon-securities` | 1 token = 1 canonical unit | [HALCYON-SECURITIES.md](HALCYON-SECURITIES.md) |
