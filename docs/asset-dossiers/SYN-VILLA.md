# Dossier: SYN-VILLA (canonical claim)

> **SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> No villa, deed, title or property exists. This record exists only so the demo catalogue has a single real-estate-style asset with a unit supply of one.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md), [ADR 0015](../decisions/0015-market-data-platform.md)

## Record

| Field                           | Value                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-villa`                                                                           |
| Name                            | Synthetic Villa Azul property record                                                  |
| Asset category                  | Synthetic real-estate property record (test only)                                     |
| Underlying instrument or claim  | A fictional record of one fictional villa, "Villa Azul"                               |
| Unit definition                 | 1 canonical unit = the whole fictional property. The unit supply is exactly 1.        |
| Currency / denomination         | USD, as a simulated appraisal price only                                              |
| Economic rights                 | None. A real property record would carry ownership or rental rights; this has none.   |
| Legal claim structure           | None. There is no deed, title register, trust or company behind it.                   |
| Jurisdiction                    | None                                                                                  |
| Redemption and settlement terms | None. The record cannot be redeemed, sold or fractionalised.                          |
| Valuation / NAV method          | Simulated appraisal series with one fictional +2.4% appraisal step (`apps/simulator`) |
| Lifecycle model                 | None on chain                                                                         |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime                           |
| Risk disclosures                | See below                                                                             |
| `synthetic`                     | `true`                                                                                |
| `verification_status`           | `unverified`                                                                          |
| Record status                   | `active` once registered with this evidence                                           |

## Convertibility and bridging

- **`convertible: false`.** A single indivisible record has no parity partner. The registry holds no relationship for it, and the off-chain profile says so. The contract remains the authority: with no approved relationship, no quote is possible.
- **`bridgeable: true`.** It is meant to be shown as an asset that could later move to an EVM chain as a whole. No bridge exists yet; the profile lists the EVM entry with role `planned`.
- The token has 0 decimals and the owner mints exactly one. The faucet is disabled so the supply cannot grow.

## Risk disclosures

- The record is not backed by any property, and every price shown for it is simulated.
- A supply of one means any holder is the only holder. Nothing prevents a second record of the same fictional villa from being registered; the registry cannot detect it.
- Do not infer that any real property token is equivalent to anything here.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multiplier of `tvilla-1` (1 token = 1 canonical unit, 0 decimals).
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No title, custody, legal, valuation or issuer verification exists.

## Representations of this claim

| Representation | Issuer               | Unit                       | Dossier                                        |
| -------------- | -------------------- | -------------------------- | ---------------------------------------------- |
| `tvilla-1`     | `halcyon-securities` | 1 token = 1 canonical unit | [HALCYON-SECURITIES.md](HALCYON-SECURITIES.md) |
