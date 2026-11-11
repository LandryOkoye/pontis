# Dossier: HALCYON-SECURITIES (issuer and its representations)

> **SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> Halcyon Securities does not exist. The project team operates this issuer so the demo catalogue has one fully set-up issuer. `issuer_attested` below means only that the issuer supplied this dossier; the contract does not check it.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `halcyon-securities`                                                                                                                    |
| Legal entity name                           | Halcyon Securities (fictional; no legal entity)                                                                                         |
| Jurisdiction                                | None                                                                                                                                    |
| Documentation                               | This dossier                                                                                                                            |
| Issuer status                               | `active`                                                                                                                                |
| Authorized asset categories                 | Tokenized equity, Treasury fund, real-estate property record, private-credit note, dollar-pegged quote asset (all synthetic, test only) |
| Issuer-controlled contracts and admin roles | The five `synthetic-token` contracts below; the owner account controls mint, burn, pause and faucet                                     |
| Custodian / service providers               | None                                                                                                                                    |
| Audit / attestation providers               | None                                                                                                                                    |
| Contact and incident information            | Pontis project team (testnet only)                                                                                                      |
| `synthetic` / `verification_status`         | `true` / `issuer_attested`                                                                                                              |

## Representations issued

| Representation | Claim        | Decimals | 1 whole token =  | Multiplier per smallest unit | Notes                                      |
| -------------- | ------------ | -------- | ---------------- | ---------------------------- | ------------------------------------------ |
| `tacme-h`      | `syn-acme`   | 6        | 1 canonical unit | `1 / 10^6`                   | Proposed pair with `tacme-m`, not approved |
| `tustb-h`      | `syn-ustb`   | 6        | 1 canonical unit | `1 / 10^6`                   | Approved pair with `tustb-o`; vault funded |
| `tvilla-1`     | `syn-villa`  | 0        | 1 canonical unit | `1`                          | Supply of exactly 1; faucet disabled       |
| `tcredit-1`    | `syn-credit` | 6        | 1 canonical unit | `1 / 10^6`                   | Maturity and redemption are narrative      |
| `tusd-h`       | `syn-usd`    | 6        | 1 canonical unit | `1 / 10^6`                   | Dollar-pegged quote asset                  |

All five: record status `active`, `synthetic` `true`, `verification_status` `issuer_attested`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in `pontis-core` ([ADR 0005](../decisions/0005-allowlist-eligibility.md)), no custody, backing or redemption, no bridge (`bridge_status` `none`).

## Why this issuer holds `tcredit-1`

`tcredit-1` could sit under the rejected issuer `vantage-credit`, but the contract only activates a representation whose issuer is `active`, so a rejected issuer's note would be a dead record. It sits under the one issuer that is fully set up, so the demo has an active private-credit asset.

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with "1 whole token = 1 canonical unit".
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity. `issuer_attested` records that evidence was provided; it is not a verification.
