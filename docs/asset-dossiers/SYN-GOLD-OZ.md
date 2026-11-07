# Dossier: SYN-GOLD-OZ (canonical claim)

> **SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This claim does not correspond to any real gold, custody arrangement, legal right or redeemable entitlement. It exists only to exercise the Pontis registry, compatibility, quote and conversion code on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided` (the issuers are the project itself); nothing here was checked by a third party
- **Related decisions:** [ADR 0001](../decisions/0001-synthetic-claim-and-units.md), [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md)

## Record

| Field                           | Value                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `canonical_asset_id`            | `syn-gold-oz`                                                                                                        |
| Name                            | Synthetic Gold, one troy ounce                                                                                       |
| Asset category                  | Synthetic commodity claim (test only)                                                                                |
| Underlying instrument or claim  | A fictional claim to one troy ounce of fictional allocated gold                                                      |
| Unit definition                 | 1 canonical unit = 1 fictional troy ounce                                                                            |
| Currency / denomination         | None. No price or valuation is defined.                                                                              |
| Economic rights                 | None. The claim confers no economic rights.                                                                          |
| Legal claim structure           | None. There is no legal entity, contract or trust behind it.                                                         |
| Jurisdiction                    | None                                                                                                                 |
| Redemption and settlement terms | None. The claim cannot be redeemed.                                                                                  |
| Valuation / NAV method          | None                                                                                                                 |
| Lifecycle model                 | None                                                                                                                 |
| Eligibility restrictions        | Testnet allowlist only ([ADR 0005](../decisions/0005-allowlist-eligibility.md)); not a regulatory eligibility regime |
| Risk disclosures                | See below                                                                                                            |
| `synthetic`                     | `true`                                                                                                               |
| `verification_status`           | `unverified`                                                                                                         |
| Record status                   | `active` once registered with this evidence                                                                          |

## Risk disclosures

- The claim is not backed by any asset. Holding a representation has no value outside the demo.
- Conversion between representations is a parity conversion by approved unit ratio. It says nothing about price.
- Do not infer from this dossier that any real token with a similar name or ticker is equivalent to anything.

## What was checked, by whom, when

- **Checked:** that the unit definition above is internally consistent with the unit multipliers in the TGOLD-A and TGOLD-B dossiers.
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-07, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

| Representation | Unit                         | Dossier                  |
| -------------- | ---------------------------- | ------------------------ |
| TGOLD-A        | 1 token = 1 canonical unit   | [TGOLD-A.md](TGOLD-A.md) |
| TGOLD-B        | 1 token = 0.1 canonical unit | [TGOLD-B.md](TGOLD-B.md) |

A shared `canonical_asset_id` is a candidate association only. Parity conversion needs an approved `DIRECT_EQUIVALENT` relationship ([ADR 0004](../decisions/0004-compatibility-and-policy-versioning.md)).
