# Dossier: MERLION-HARBOUR-TRUST (issuer and its representations)

> **FICTIONAL DEMO DATA. SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> Merlion Harbour Trust does not exist. Its name, domain and tickers are invented and imitate no real company or product; its jurisdiction is a real place used only as a plain fact. It is not licensed, registered or supervised by anyone.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `demo` and above (`--catalogue=demo|full`)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `merlion-harbour-trust`                                                                                                |
| Legal entity name                           | Merlion Harbour Trust (fictional; no legal entity)                                                                     |
| Jurisdiction                                | Singapore (a real place, as a plain fact; the issuer is fictional)                                                     |
| Kind of firm (fiction)                      | Fund manager with a capital-markets services licence category in Singapore                                             |
| Fictional domain                            | `merlion-harbour-trust.example` (a reserved example domain; no website or mailbox exists)                              |
| Documentation                               | This dossier                                                                                                           |
| Issuer status                               | `active`                                                                                                               |
| Authorized asset categories                 | Synthetic Treasury fund (test only); Synthetic money-market fund (test only); Synthetic stable-value token (test only) |
| Issuer-controlled contracts and admin roles | The 4 `synthetic-token` contracts below; the owner account controls mint, burn, pause and faucet                       |
| Custodian / service providers               | None                                                                                                                   |
| Audit / attestation providers               | None                                                                                                                   |
| Contact and incident information            | Simulated desk contact: desk@merlion-harbour-trust.example (a reserved example domain; no mailbox exists)              |
| `synthetic` / `verification_status`         | `true` / `issuer_attested`                                                                                             |

## Story (fiction)

A fictional treasury and money-market house that also issues a euro stable-value token. Active, attested by its own dossier only.

## Representations issued

| Representation | Claim          | Decimals | 1 whole token =    | Multiplier per smallest unit | Record status | Tier   | Notes                                                                                                                            |
| -------------- | -------------- | -------- | ------------------ | ---------------------------- | ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `ttb3m-m`      | `syn-tbill-3m` | 6        | 1 canonical unit   | `1 / 10^6`                   | `active`      | `demo` | Pair with `ttb3m-e`: DIRECT_EQUIVALENT, approved with a `fund` guard; Pair with `tmmfusd-m`: ECONOMICALLY_SIMILAR, proposed only |
| `tmmfusd-m`    | `syn-mmf-usd`  | 6        | 1 canonical unit   | `1 / 10^6`                   | `active`      | `demo` | Pair with `tmmfusd-e`: DIRECT_EQUIVALENT, approved with a `fund` guard; Pair with `ttb3m-m`: ECONOMICALLY_SIMILAR, proposed only |
| `teur-m`       | `syn-eur`      | 6        | 1 canonical unit   | `1 / 10^6`                   | `active`      | `demo` | Pair with `teur-e`: DIRECT_EQUIVALENT, approved with a `stable` guard                                                            |
| `tjpy-m`       | `syn-jpy`      | 6        | 100 canonical unit | `1 / 10^4`                   | `active`      | `full` | Pair with `tjpy-s`: DIRECT_EQUIVALENT, approved with a `stable` guard                                                            |

All: `synthetic` `true`, `verification_status` `issuer_attested`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in `pontis-core` ([ADR 0005](../decisions/0005-allowlist-eligibility.md)), no custody, backing or redemption, no bridge (`bridge_status` `none`).

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with its "1 whole token =" column.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity, licensing, jurisdiction. `issuer_attested` records that evidence was provided; it is not a verification.
