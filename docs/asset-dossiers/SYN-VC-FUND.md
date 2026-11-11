# Dossier: SYN-VC-FUND (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a venture or private-equity fund and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `canonical_asset_id`            | `syn-vc-fund`                                                                              |
| Name                            | Synthetic Venture Growth Fund unit                                                         |
| Asset category                  | Synthetic venture or private-equity fund (test only)                                       |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional venture growth fund.                          |
| Unit definition                 | 1 canonical unit = 1 fictional fund unit with a quarterly mark near 1,420 USD at the start |
| Currency / denomination         | USD, as a simulated price only                                                             |
| Economic rights                 | None. The claim confers no economic rights.                                                |
| Legal claim structure           | None. There is no fund, manager, custodian or trust behind it.                             |
| Jurisdiction                    | None                                                                                       |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                        |
| Valuation / NAV method          | Simulated quarterly mark: almost flat between marks and one +3.1% mark on 2026-09-30.      |
| Lifecycle model                 | Closed-end style unit with quarterly marks in the fiction; no redemption.                  |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                               |
| Risk disclosures                | See below                                                                                  |
| `synthetic`                     | `true`                                                                                     |
| `verification_status`           | `unverified`                                                                               |
| Record status                   | `active` once registered with this evidence                                                |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Real private-fund units are illiquid and marked by the manager; this mark is a simulator step.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A fund sponsored by an issuer that was later moved back to restricted, so the token is registered but cannot convert.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                      | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                      |
| -------------- | --------------------------- | -------- | ---------------- | ---------------------------- | ------------- | ------------------------------------------------------------ |
| `tvcf-t`       | `kittiwake-cayman-partners` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [KITTIWAKE-CAYMAN-PARTNERS.md](KITTIWAKE-CAYMAN-PARTNERS.md) |

This claim has one representation, so no relationship exists for it.
