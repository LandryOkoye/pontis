# Dossier: SYN-STOCK-QUILLFEATHER (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a tokenized equity and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-stock-quillfeather`                                                                                        |
| Name                            | Synthetic Quillfeather Biotech ordinary share                                                                   |
| Asset category                  | Synthetic tokenized equity (test only)                                                                          |
| Underlying instrument or claim  | A fictional claim to one ordinary share of Quillfeather Biotech, a fictional company.                           |
| Unit definition                 | 1 canonical unit = 1 fictional Quillfeather Biotech ordinary share                                              |
| Currency / denomination         | USD, as a simulated price only                                                                                  |
| Economic rights                 | None. The claim confers no economic rights.                                                                     |
| Legal claim structure           | None. There is no company, share register or custodian behind it.                                               |
| Jurisdiction                    | None                                                                                                            |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                                             |
| Valuation / NAV method          | Simulated price near 63.40 USD, about 2.8% a day, with a -7% step on 2026-10-14 (a trial readout in the story). |
| Lifecycle model                 | Listed share in the fiction; no dividends, no corporate actions.                                                |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                                                    |
| Risk disclosures                | See below                                                                                                       |
| `synthetic`                     | `true`                                                                                                          |
| `verification_status`           | `unverified`                                                                                                    |
| Record status                   | `active` once registered with this evidence                                                                     |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- A single-share price is far more volatile than a basket; this one is simulated.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A volatile single stock wrapped by a British dealer and by an applicant in Hong Kong whose review is still pending, so the pair is proposed and cannot be approved.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                    | Decimals | 1 whole token =       | Multiplier per smallest unit | Record status | Dossier                                                  |
| -------------- | ------------------------- | -------- | --------------------- | ---------------------------- | ------------- | -------------------------------------------------------- |
| `tqfb-p`       | `pennywhistle-securities` | 6        | 1 canonical unit      | `1 / 10^6`                   | `active`      | [PENNYWHISTLE-SECURITIES.md](PENNYWHISTLE-SECURITIES.md) |
| `tqfb-o`       | `peninsula-orient-assets` | 8        | 1 / 10 canonical unit | `1 / 10^9`                   | `restricted`  | [PENINSULA-ORIENT-ASSETS.md](PENINSULA-ORIENT-ASSETS.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tqfb-p`

No custody is recorded for `tqfb-p`: the custody screens show their empty state, which is intended.

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Redemption terms | none: not redeemable in this demo |

### `tqfb-o`

No custody is recorded for `tqfb-o`: the custody screens show their empty state, which is intended.

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Redemption terms | none: not redeemable in this demo |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                | Outcome                          | Ratio      | Why                                                                                   |
| ------------------- | -------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `tqfb-o` : `tqfb-p` | DIRECT_EQUIVALENT, proposed only | `1 / 1000` | Not approved: tqfb-o cannot be activated while peninsula-orient-assets is restricted. |
