# Dossier: SYN-NOVA (canonical claim)

> **SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> Nova Systems does not exist. This claim corresponds to no share, register, custodian or legal right. It exists only so the demo catalogue has an equity with a pending corporate action.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md), [ADR 0015](../decisions/0015-market-data-platform.md)

## Record

| Field                           | Value                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-nova`                                                                          |
| Name                            | Synthetic Nova Systems ordinary share                                               |
| Asset category                  | Synthetic tokenized equity (test only)                                              |
| Underlying instrument or claim  | A fictional claim to one ordinary share of Nova Systems, a fictional listed company |
| Unit definition                 | 1 canonical unit = 1 fictional Nova Systems ordinary share, before the split below  |
| Currency / denomination         | USD, as a simulated price only                                                      |
| Economic rights                 | None. A real share would carry dividend and voting rights; this claim confers none. |
| Legal claim structure           | None. There is no company, share register, trust or contract behind it.             |
| Jurisdiction                    | None                                                                                |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                 |
| Valuation / NAV method          | Simulated price feed (`apps/simulator`); not a market price                         |
| Lifecycle model                 | Announced corporate action, not applied: see below                                  |
| Eligibility restrictions        | Testnet allowlist only; not a regulatory eligibility regime                         |
| Risk disclosures                | See below                                                                           |
| `synthetic`                     | `true`                                                                              |
| `verification_status`           | `unverified`                                                                        |
| Record status                   | `active` once registered with this evidence                                         |

## Announced corporate action (narrative)

- **Action:** a fictional 2-for-1 stock split, announced 2026-11-03, with a fictional effective date of 2026-12-15.
- **Intended effect:** one share becomes two, so the canonical unit would halve in value and a holder's token balance would need to double, or the unit multiplier would need to halve.
- **State today:** announced only. It has not been applied. The unit multiplier of a representation is immutable after registration ([ADR 0001](../decisions/0001-synthetic-claim-and-units.md)), and nothing on chain implements corporate actions yet; a later workstream ([ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md), workstream B) is meant to. Until then this text is the only place the action exists, and the simulated price series does not include the split.

## Risk disclosures

- The claim is not backed by any asset, and the prices shown for it are simulated.
- The announced split is a narrative. Nothing will happen on the effective date, and no balance, multiplier or price will change.
- Do not infer that any real token or ticker with a similar name is equivalent to anything here.

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multiplier recorded in the issuer dossier of the representation below.
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit, corporate-action or issuer verification exists.

## Representations of this claim

| Representation | Issuer            | Unit                       | Dossier                                  |
| -------------- | ----------------- | -------------------------- | ---------------------------------------- |
| `tnova-m`      | `meridian-assets` | 1 token = 1 canonical unit | [MERIDIAN-ASSETS.md](MERIDIAN-ASSETS.md) |

There is one representation and no relationship. `tnova-m` stays `restricted` because its issuer is `restricted`.
