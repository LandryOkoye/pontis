# Dossier: SYN-EUR (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not a stable-value token and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)

## Record

| Field                           | Value                                                              |
| ------------------------------- | ------------------------------------------------------------------ |
| `canonical_asset_id`            | `syn-eur`                                                          |
| Name                            | Synthetic Euro                                                     |
| Asset category                  | Synthetic stable-value token (test only)                           |
| Underlying instrument or claim  | A fictional claim to one euro.                                     |
| Unit definition                 | 1 canonical unit = 1 fictional euro                                |
| Currency / denomination         | EUR, shown in USD at a simulated 1.085 only                        |
| Economic rights                 | None. The claim confers no economic rights.                        |
| Legal claim structure           | None. There is no reserve, issuer obligation or bank account.      |
| Jurisdiction                    | None                                                               |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                |
| Valuation / NAV method          | Simulated price reverting to 1.085 USD; a peg in the fiction only. |
| Lifecycle model                 | Stable-value token; no strike, no maturity.                        |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime.       |
| Risk disclosures                | See below                                                          |
| `synthetic`                     | `true`                                                             |
| `verification_status`           | `unverified`                                                       |
| Record status                   | `active` once registered with this evidence                        |

## Risk disclosures

- Not backed by any asset; prices and supply are simulated.
- Nothing backs the peg; a real stable-value token has reserve and issuer risk.
- Do not infer that any real instrument is equivalent to anything here.

## Story (fiction)

A euro stable-value token wrapped by Singapore and Irish issuers; the tightest guard of any pair.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Issuer                  | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Dossier                                              |
| -------------- | ----------------------- | -------- | ---------------- | ---------------------------- | ------------- | ---------------------------------------------------- |
| `teur-m`       | `merlion-harbour-trust` | 6        | 1 canonical unit | `1 / 10^6`                   | `active`      | [MERLION-HARBOUR-TRUST.md](MERLION-HARBOUR-TRUST.md) |
| `teur-e`       | `emerald-tern-capital`  | 8        | 1 canonical unit | `1 / 10^8`                   | `active`      | [EMERALD-TERN-CAPITAL.md](EMERALD-TERN-CAPITAL.md)   |

## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (`pontis-reserve-v1`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by `seed-custody` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

### `teur-m`

| Field                | Value                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custodian (invented) | Ferncliff On-Chain Vault (SIMULATED), `ferncliff-vault-sim`, KY                                                                                                |
| Structure            | `on_chain_vault`                                                                                                                                               |
| Reserve story        | `stale`: attested once with a 5 minute max age and not refreshed: `ok` for minutes, then the route is restricted (`reserve_stale`). The story decays by design |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 5 min                                                                                                         |
| Simulated cover      | 10000 bps of supply, signed by the public dev key                                                                                                              |
| Seeded by            | `--catalogue=demo\|full`                                                                                                                                       |
| Redemption terms     | none: not redeemable in this demo                                                                                                                              |

### `teur-e`

| Field                | Value                                                           |
| -------------------- | --------------------------------------------------------------- |
| Custodian (invented) | Ferncliff On-Chain Vault (SIMULATED), `ferncliff-vault-sim`, KY |
| Structure            | `on_chain_vault`                                                |
| Reserve story        | `healthy`: attested above supply: the state is `ok`             |
| Reserve policy       | `restrict_conversions`, tolerance 0 bps, max age 1 d            |
| Simulated cover      | 10100 bps of supply, signed by the public dev key               |
| Seeded by            | `--catalogue=full`                                              |
| Redemption terms     | none: not redeemable in this demo                               |

## Relationships

A shared `canonical_asset_id` is a candidate association only. Only an approved `DIRECT_EQUIVALENT` relationship enables parity conversion, and only while both issuers are `active`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

| Pair                | Outcome                                           | Ratio     | Why                                                                                                |
| ------------------- | ------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `teur-e` : `teur-m` | DIRECT_EQUIVALENT, approved with a `stable` guard | `1 / 100` | Approved for the demo catalogue while both issuers were active; self-reviewed by the project team. |
