# Dossier: SYN-NOTE-SME (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a private-credit note and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-note-sme`                                                                                                                                           |
| Name                            | Synthetic SME Loan Note 2027                                                                                                                             |
| Asset category                  | Synthetic private-credit note (test only)                                                                                                                |
| Underlying instrument or claim  | A fictional claim to one fictional senior note of 100 USD nominal issued against a fictional pool of small-business loans.                               |
| Unit definition                 | 1 canonical unit = 1 fictional note of 100 USD nominal                                                                                                   |
| Currency / denomination         | USD, as a simulated NAV only                                                                                                                             |
| Economic rights                 | None. The claim confers no payment rights.                                                                                                               |
| Legal claim structure           | None. There is no borrower, loan agreement, security or trustee.                                                                                         |
| Jurisdiction                    | Canada (a real place, as a plain fact; the claim is fictional)                                                                                           |
| Redemption and settlement terms | Narrative only: maturity 2027-06-30, redemption at nominal plus accrued interest. Not implemented anywhere.                                              |
| Valuation / NAV method          | Simulated NAV accruing about 9.4% a year toward maturity; not a valuation.                                                                               |
| Lifecycle model                 | Term instrument with maturity 2027-06-30 in the fiction. The NAV is a simulator output, no strike is published and nothing happens on the maturity date. |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                                                                                             |
| Risk disclosures                | See below                                                                                                                                                |
| `synthetic`                     | `true`                                                                                                                                                   |
| `verification_status`           | `unverified`                                                                                                                                             |
| Record status                   | `active` once registered with this evidence                                                                                                              |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Maturity and redemption terms are text: no contract pays out or burns anything at maturity.
- A real loan pool carries default and prepayment risk that is not modelled.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A term note from a Canadian lender, the longest-dated instrument in the catalogue.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                          |
| -------------- | --------------------- | -------- | ---------------- | ---------------------------- | ------------- | ------------------------------------------------ |
| `tsme-b`       | `boreal-larch-credit` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [BOREAL-LARCH-CREDIT.md](BOREAL-LARCH-CREDIT.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tsme-b`

| Field                | Value                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Custodian (invented) | Northquay Securities Custody (SIMULATED), `northquay-custody-sim`, LU                                                                       |
| Structure            | `segregated`                                                                                                                                |
| Reserve story        | `healthy`: attested above supply: the state is `ok`                                                                                         |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d                                                                                        |
| Simulated cover      | 10250 bps of supply, signed by the public dev key                                                                                           |
| Seeded by            | `--catalogue=full`                                                                                                                          |
| Redemption terms     | at least 500 and no maximum whole tokens, fee 120 bps, open 5 d in every 91 d, issuer accepts within 3 d and settles within 7 d (simulated) |

This claim has one representation, so no relationship exists for it.
