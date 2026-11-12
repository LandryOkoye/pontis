# Dossier: SYN-PE-FUND (canonical claim)

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
| `canonical_asset_id`            | `syn-pe-fund`                                                                              |
| Name                            | Synthetic Buyout Fund II unit                                                              |
| Asset category                  | Synthetic venture or private-equity fund (test only)                                       |
| Underlying instrument or claim  | A fictional claim to one unit of a fictional buyout fund.                                  |
| Unit definition                 | 1 canonical unit = 1 fictional fund unit with a quarterly mark near 2,015 USD at the start |
| Currency / denomination         | USD, as a simulated price only                                                             |
| Economic rights                 | None. The claim confers no economic rights.                                                |
| Legal claim structure           | None. There is no fund, manager, custodian or trust behind it.                             |
| Jurisdiction                    | None                                                                                       |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                        |
| Valuation / NAV method          | Simulated quarterly mark: almost flat between marks and one -1.2% mark on 2026-09-30.      |
| Lifecycle model                 | Closed-end style unit with quarterly marks in the fiction; no redemption.                  |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.                               |
| Risk disclosures                | See below                                                                                  |
| `synthetic`                     | `true`                                                                                     |
| `verification_status`           | `unverified`                                                                               |
| Record status                   | `active` once registered with this evidence                                                |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- A real buyout fund calls and distributes capital; none of that is modelled.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

Wrapped by the sponsor and by a feeder in another country. The parity pair is only proposed.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                      | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                                      |
| -------------- | --------------------------- | -------- | ---------------- | ---------------------------- | ------------- | ------------------------------------------------------------ |
| `tpef-t`       | `kittiwake-cayman-partners` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [KITTIWAKE-CAYMAN-PARTNERS.md](KITTIWAKE-CAYMAN-PARTNERS.md) |
| `tpef-c`       | `cobaltine-fund-services`   | 8        | 1 canonical unit | `1 / 10^8`                   | `active`      | [COBALTINE-FUND-SERVICES.md](COBALTINE-FUND-SERVICES.md)     |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `tpef-t`

No custody is recorded for `tpef-t`: the custody screens show their empty state, which is intended.

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Redemption terms | none: not redeemable in this demo |

### `tpef-c`

No custody is recorded for `tpef-c`: the custody screens show their empty state, which is intended.

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Redemption terms | none: not redeemable in this demo |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                | Outcome                          | Ratio     | Why                                                                                            |
| ------------------- | -------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `tpef-c` : `tpef-t` | DIRECT_EQUIVALENT, proposed only | `1 / 100` | Left proposed: the story's reviewer is waiting for the feeder's evidence. Nothing approves it. |
