# Dossier: SYN-STOCK-MARLOWE (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a tokenized equity and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)

## Record

| Field                           | Value                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-stock-marlowe`                                                                                                                                                                                                                                                                       |
| Name                            | Synthetic Marlowe & Finch Retail ordinary share (delisted)                                                                                                                                                                                                                                |
| Asset category                  | Synthetic tokenized equity (test only)                                                                                                                                                                                                                                                    |
| Underlying instrument or claim  | A fictional claim to one ordinary share of Marlowe & Finch Retail, a fictional company that was delisted.                                                                                                                                                                                 |
| Unit definition                 | 1 canonical unit = 1 fictional Marlowe & Finch Retail ordinary share                                                                                                                                                                                                                      |
| Currency / denomination         | USD, as a simulated price only                                                                                                                                                                                                                                                            |
| Economic rights                 | None. The claim confers no economic rights.                                                                                                                                                                                                                                               |
| Legal claim structure           | None. There is no company, share register or custodian behind it.                                                                                                                                                                                                                         |
| Jurisdiction                    | None                                                                                                                                                                                                                                                                                      |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                                                                                                                                                                                                                       |
| Valuation / NAV method          | Simulated price near 14.25 USD with a +34% step on 2026-09-03 (a takeover offer in the story). The series is not stopped on the delisting date.                                                                                                                                           |
| Lifecycle model                 | Delisted on 2026-10-14 in the fiction after a takeover. The on-chain effect is one registrar action: the wrapper was moved to deprecated, which is terminal. The two-step delisting of ADR 0018 (request and approve by different accounts) is not used because the seed has one account. |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                                                                                                                                                                                                                              |
| Risk disclosures                | See below                                                                                                                                                                                                                                                                                 |
| `synthetic`                     | `true`                                                                                                                                                                                                                                                                                    |
| `verification_status`           | `unverified`                                                                                                                                                                                                                                                                              |
| Record status                   | `active` once registered with this evidence                                                                                                                                                                                                                                               |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- The wrapper was deprecated after the story's delisting; the simulated price keeps moving, which a real delisted share would not.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

The demo's delisted asset: the claim stays registered and its only wrapper is deprecated.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                    | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                  |
| -------------- | ------------------------- | -------- | ---------------- | ---------------------------- | ------------- | -------------------------------------------------------- |
| `tmfr-p`       | `pennywhistle-securities` | 6        | 1 canonical unit | `1 / 10^6`                   | `deprecated`  | [PENNYWHISTLE-SECURITIES.md](PENNYWHISTLE-SECURITIES.md) |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tmfr-p`

No custody is recorded for `tmfr-p`: the custody screens show their empty state, which is intended.

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Redemption terms | none: not redeemable in this demo |

This claim has one representation, so no relationship exists for it.
