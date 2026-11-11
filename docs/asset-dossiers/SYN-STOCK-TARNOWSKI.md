# Dossier: SYN-STOCK-TARNOWSKI (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a tokenized equity and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-stock-tarnowski`                                                                              |
| Name                            | Synthetic Tarnowski Grid Utilities ordinary share                                                  |
| Asset category                  | Synthetic tokenized equity (test only)                                                             |
| Underlying instrument or claim  | A fictional claim to one ordinary share of Tarnowski Grid Utilities, a fictional company.          |
| Unit definition                 | 1 canonical unit = 1 fictional Tarnowski Grid Utilities ordinary share, before the announced split |
| Currency / denomination         | USD, as a simulated price only                                                                     |
| Economic rights                 | None. The claim confers no economic rights.                                                        |
| Legal claim structure           | None. There is no company, share register or custodian behind it.                                  |
| Jurisdiction                    | None                                                                                               |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                                |
| Valuation / NAV method          | Simulated price near 38.90 USD, about 1.2% a day; it does not include the split.                   |
| Lifecycle model                 | Listed share in the fiction with a split scheduled but not applied.                                |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                                       |
| Risk disclosures                | See below                                                                                          |
| `synthetic`                     | `true`                                                                                             |
| `verification_status`           | `unverified`                                                                                       |
| Record status                   | `active` once registered with this evidence                                                        |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- The split is a record in this dossier only: nothing on chain implements it, and nothing will change on the effective date.
- Do not infer that any real instrument is equivalent to anything here.

## Corporate action record (dossier only)

A 3-for-1 stock split was announced on 2026-11-02 for 2026-12-01. It is recorded here only. No corporate action exists on chain for this claim, so no multiplier changes and no freeze window opens; an operator could propose one with `actions propose` (ADR 0017), which this seed does not.

## Story (fiction)

A defensive utility share with a split on the calendar, the one the dossier-only action describes.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                    | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                  |
| -------------- | ------------------------- | -------- | ---------------- | ---------------------------- | ------------- | -------------------------------------------------------- |
| `ttgu-p`       | `pennywhistle-securities` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [PENNYWHISTLE-SECURITIES.md](PENNYWHISTLE-SECURITIES.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `ttgu-p`

No custody is recorded for `ttgu-p`: the custody screens show their empty state, which is intended.

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Redemption terms | none: not redeemable in this demo |

This claim has one representation, so no relationship exists for it.
