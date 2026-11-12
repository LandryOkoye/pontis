# Dossier: KITTIWAKE-CAYMAN-PARTNERS (issuer and its representations)

> **FICTIONAL DEMO DATA. SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> Kittiwake Cayman Partners does not exist. Its name, domain and tickers are invented and imitate no real company or product; its jurisdiction is a real place used only as a plain fact. It is not licensed, registered or supervised by anyone.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `kittiwake-cayman-partners`                                                                                                           |
| Legal entity name                           | Kittiwake Cayman Partners (fictional; no legal entity)                                                                                |
| Jurisdiction                                | Cayman Islands (a real place, as a plain fact; the issuer is fictional)                                                               |
| Kind of firm (fiction)                      | Private-fund sponsor of a category registered in the Cayman Islands                                                                   |
| Fictional domain                            | `kittiwake-cayman-partners.example` (a reserved example domain; no website or mailbox exists)                                         |
| Documentation                               | This dossier                                                                                                                          |
| Issuer status                               | `restricted`: it was `active` while its tokens were registered and its pairs approved, then a registrar moved it back to `restricted` |
| Authorized asset categories                 | Synthetic venture or private-equity fund (test only); Synthetic commercial real-estate fund (test only)                               |
| Issuer-controlled contracts and admin roles | The 3 `synthetic-token` contracts below; the owner account controls mint, burn, pause and faucet                                      |
| Custodian / service providers               | None                                                                                                                                  |
| Audit / attestation providers               | None                                                                                                                                  |
| Contact and incident information            | Simulated desk contact: desk@kittiwake-cayman-partners.example (a reserved example domain; no mailbox exists)                         |
| `synthetic` / `verification_status`         | `true` / `issuer_attested`                                                                                                            |

## Story (fiction)

A fictional private-fund sponsor. It was active when its tokens were registered and its pair approved; the registrar later moved it back to restricted after the story says its dossier went stale (2026-10-20). Restricted, unlike deprecated, can be reversed, but nothing does that here.

## Why the tokens cannot convert

The tokens below were registered and activated while the issuer was `active`, and their relationships were approved then. A registrar later moved the issuer back to `restricted`. The contract treats a representation as executable only while its issuer is `active`, so no conversion involving them can run. Nothing re-activates the issuer here.

## Representations issued

| Representation | Claim               | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status             | Tier   | Notes                                                                                                                                                                     |
| -------------- | ------------------- | -------- | ---------------- | ---------------------------- | ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tcrel-t`      | `syn-cre-logistics` | 8        | 1 canonical unit | `1 / 10^8`                   | `active` (cannot convert) | `full` | Its issuer was moved back to restricted after the pair was approved, so the pair cannot convert; Pair with `tcrel-r`: DIRECT_EQUIVALENT, approved with a `illiquid` guard |
| `tvcf-t`       | `syn-vc-fund`       | 6        | 1 canonical unit | `1 / 10^6`                   | `active` (cannot convert) | `full` | Its issuer was moved back to restricted, so the token cannot convert                                                                                                      |
| `tpef-t`       | `syn-pe-fund`       | 6        | 1 canonical unit | `1 / 10^6`                   | `active` (cannot convert) | `full` | Pair with `tpef-c`: DIRECT_EQUIVALENT, proposed only                                                                                                                      |

All: `synthetic` `true`, `verification_status` `issuer_attested`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in `pontis-core` ([ADR 0005](../decisions/0005-allowlist-eligibility.md)), no custody, backing or redemption, no bridge (`bridge_status` `none`).

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with its "1 whole token =" column.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity, licensing, jurisdiction. `issuer_attested` records that evidence was provided; it is not a verification.
