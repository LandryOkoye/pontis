# Dossier: TGOLD-B (token representation)

> **SYNTHETIC TEST TOKEN. UNBACKED. UNVERIFIED BY DESIGN.**
> Not a real asset. Testnet only. No custody, backing or redemption exists.

- **Record types:** issuer (brief §6.2) and token representation (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Claim:** [SYN-GOLD-OZ](SYN-GOLD-OZ.md)
- **Deployed account IDs:** recorded in `docs/architecture/deployments.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `synthetic-issuer-b`                                                                        |
| Legal entity name                           | Synthetic Issuer B (fictional; no legal entity)                                             |
| Jurisdiction                                | None                                                                                        |
| Documentation                               | This dossier                                                                                |
| Issuer status                               | `active` (test registry entry)                                                              |
| Authorized asset categories                 | Synthetic test claims                                                                       |
| Issuer-controlled contracts and admin roles | The TGOLD-B `synthetic-token` contract; owner account controls mint, burn, pause and faucet |
| Custodian / service providers               | None                                                                                        |
| Audit / attestation providers               | None                                                                                        |
| Contact and incident information            | Pontis project team (testnet only)                                                          |
| `synthetic` / `verification_status`         | `true` / `unverified`                                                                       |

## Representation record

| Field                                         | Value                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `representation_id`                           | `tgold-b`                                                                                                                 |
| `canonical_asset_id`                          | `syn-gold-oz` (candidate association, not automatic equivalence)                                                          |
| `issuer_id`                                   | `synthetic-issuer-b`                                                                                                      |
| Chain / network                               | NEAR Testnet                                                                                                              |
| Token standard                                | NEP-141 (`synthetic-token` contract)                                                                                      |
| Name / symbol                                 | `SYNTHETIC TEST Gold B` / `TGOLD-B`                                                                                       |
| Decimals                                      | 8                                                                                                                         |
| Smallest-unit conversion                      | 1 whole token = 10^8 smallest units                                                                                       |
| Canonical unit multiplier (per smallest unit) | `1 / 1_000_000_000`                                                                                                       |
| Meaning of 1 whole token                      | 0.1 canonical unit                                                                                                        |
| Mint / burn / pause / freeze / admin          | Owner mint and burn; owner pause; testnet `faucet_mint` with per-call cap and per-account cooldown; no freeze or clawback |
| Custody and backing                           | None                                                                                                                      |
| Redemption mechanism                          | None                                                                                                                      |
| Transfer policy and eligibility               | Testnet allowlist in `pontis-core` ([ADR 0005](../decisions/0005-allowlist-eligibility.md))                               |
| Bridge / wrapper status                       | Neither                                                                                                                   |
| Adapter version                               | None (no issuer adapter in the MVP)                                                                                       |
| Evidence and verification                     | Self-attested, `unverified`                                                                                               |
| Record status                                 | `active` once registered with this evidence                                                                               |

## What was checked, by whom, when

- **Checked:** decimals (8) and the multiplier `1 / 10^9` are consistent with "1 whole token = 0.1 canonical unit" (0.1 / 10^8 = 1 / 10^9).
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-07, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity.

## Pair note

With TGOLD-A the derived A to B ratio is `1000 / 1` in smallest units (1 A = 10 B), so `out_B = in_A * 1000`. See [TGOLD-A.md](TGOLD-A.md) and [ADR 0001](../decisions/0001-synthetic-claim-and-units.md).
