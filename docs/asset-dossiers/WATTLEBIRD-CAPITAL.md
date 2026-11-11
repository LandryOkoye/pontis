# Dossier: WATTLEBIRD-CAPITAL (issuer and its representations)

> **FICTIONAL DEMO DATA. SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> Wattlebird Capital does not exist. Its name, domain and tickers are invented and imitate no real company or product; its jurisdiction is a real place used only as a plain fact. It is not licensed, registered or supervised by anyone.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `wattlebird-capital`                                                                                                              |
| Legal entity name                           | Wattlebird Capital (fictional; no legal entity)                                                                                   |
| Jurisdiction                                | Australia (a real place, as a plain fact; the issuer is fictional)                                                                |
| Kind of firm (fiction)                      | Metals and carbon trader of a category supervised in Australia                                                                    |
| Fictional domain                            | `wattlebird-capital.example` (a reserved example domain; no website or mailbox exists)                                            |
| Documentation                               | This dossier                                                                                                                      |
| Issuer status                               | `deprecated`: it was `active` while its tokens were registered and its pairs approved, then a registrar deprecated it (terminal)  |
| Authorized asset categories                 | Synthetic precious-metal claim (test only); Synthetic industrial commodity claim (test only); Synthetic carbon credit (test only) |
| Issuer-controlled contracts and admin roles | The 3 `synthetic-token` contracts below; the owner account controls mint, burn, pause and faucet                                  |
| Custodian / service providers               | None                                                                                                                              |
| Audit / attestation providers               | None                                                                                                                              |
| Contact and incident information            | Simulated desk contact: desk@wattlebird-capital.example (a reserved example domain; no mailbox exists)                            |
| `synthetic` / `verification_status`         | `true` / `issuer_attested`                                                                                                        |

## Story (fiction)

A fictional trader whose self-attestation lapsed on 2026-09-30 and was not renewed, so the registrar deprecated it, which is terminal. The lapse is a story: the registry has no attestation expiry. Its tokens were active and their pairs approved first, and none can convert now.

## The lapsed attestation is a narrative

In the fiction, this issuer provided its own attestation, which lapsed on 2026-09-30 without renewal, and the registrar deprecated the issuer. **That is a story, not a mechanism.** The registry has no attestation expiry: nothing checked a date, and nothing downgraded the record automatically. `verification_status` stays `issuer_attested` because records cannot be edited after registration; the only on-chain fact is that a registrar moved the issuer to `deprecated`, a terminal status. The contract treats a representation as executable only while its issuer is `active`, so none of the tokens below can convert, although their relationships were approved while the issuer was active.

## Representations issued

| Representation | Claim            | Decimals | 1 whole token =       | Multiplier per smallest unit | Record status             | Tier   | Notes                                                                                                                                                                                         |
| -------------- | ---------------- | -------- | --------------------- | ---------------------------- | ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsil-w`       | `syn-silver-oz`  | 4        | 1 canonical unit      | `1 / 10^4`                   | `active` (cannot convert) | `full` | Its issuer was deprecated after the story's attestation lapsed, so it cannot convert although its pair was approved; Pair with `tsil-a`: DIRECT_EQUIVALENT, approved with a `commodity` guard |
| `tcu-w`        | `syn-copper-t`   | 8        | 1 / 10 canonical unit | `1 / 10^9`                   | `active` (cannot convert) | `full` | Its issuer was deprecated, so its approved pair with tcu-d cannot convert; Pair with `tcu-d`: DIRECT_EQUIVALENT, approved with a `commodity` guard                                            |
| `tcbe-w`       | `syn-carbon-eng` | 6        | 1 canonical unit      | `1 / 10^6`                   | `active` (cannot convert) | `full` | Its issuer was deprecated after the story's attestation lapsed                                                                                                                                |

All: `synthetic` `true`, `verification_status` `issuer_attested`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in `pontis-core` ([ADR 0005](../decisions/0005-allowlist-eligibility.md)), no custody, backing or redemption, no bridge (`bridge_status` `none`).

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with its "1 whole token =" column.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity, licensing, jurisdiction. `issuer_attested` records that evidence was provided; it is not a verification.
