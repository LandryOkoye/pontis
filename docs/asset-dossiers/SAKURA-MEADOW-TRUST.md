# Dossier: SAKURA-MEADOW-TRUST (issuer and its representations)

> **FICTIONAL DEMO DATA. SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> Sakura Meadow Trust does not exist. Its name, domain and tickers are invented and imitate no real company or product; its jurisdiction is a real place used only as a plain fact. It is not licensed, registered or supervised by anyone.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `sakura-meadow-trust`                                                                                   |
| Legal entity name                           | Sakura Meadow Trust (fictional; no legal entity)                                                        |
| Jurisdiction                                | Japan (a real place, as a plain fact; the issuer is fictional)                                          |
| Kind of firm (fiction)                      | Funds-transfer or trust company of a category registered in Japan                                       |
| Fictional domain                            | `sakura-meadow-trust.example` (a reserved example domain; no website or mailbox exists)                 |
| Documentation                               | This dossier                                                                                            |
| Issuer status                               | `active`                                                                                                |
| Authorized asset categories                 | Synthetic stable-value token (test only); Synthetic dollar-pegged quote asset (test only)               |
| Issuer-controlled contracts and admin roles | The 2 `synthetic-token` contracts below; the owner account controls mint, burn, pause and faucet        |
| Custodian / service providers               | None                                                                                                    |
| Audit / attestation providers               | None                                                                                                    |
| Contact and incident information            | Simulated desk contact: desk@sakura-meadow-trust.example (a reserved example domain; no mailbox exists) |
| `synthetic` / `verification_status`         | `true` / `unverified`                                                                                   |

## Story (fiction)

A fictional trust company issuing yen and dollar stable-value tokens. Active but unverified: the registrar activated it with a dossier and did not record it as attested.

## Why it is unverified

The registrar activated this issuer on the strength of its dossier and did not record it as `issuer_attested`. The contract allows that: activation needs evidence, not a verification status.

## Representations issued

| Representation | Claim     | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status | Tier   | Notes                                                                                                                            |
| -------------- | --------- | -------- | ---------------- | ---------------------------- | ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `tjpy-s`       | `syn-jpy` | 2        | 1 canonical unit | `1 / 10^2`                   | `active`      | `full` | Pair with `tjpy-m`: DIRECT_EQUIVALENT, approved with a `stable` guard                                                            |
| `tusd-s`       | `syn-usd` | 4        | 1 canonical unit | `1 / 10^4`                   | `active`      | `full` | Only this side of the pair with tusd-h has a funded vault; Pair with `tusd-h`: DIRECT_EQUIVALENT, approved with a `stable` guard |

All: `synthetic` `true`, `verification_status` `unverified`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in `pontis-core` ([ADR 0005](../decisions/0005-allowlist-eligibility.md)), no custody, backing or redemption, no bridge (`bridge_status` `none`).

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with its "1 whole token =" column.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity, licensing, jurisdiction. `unverified` records that no attestation was recorded.
