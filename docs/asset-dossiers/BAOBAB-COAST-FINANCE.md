# Dossier: BAOBAB-COAST-FINANCE (issuer and its representations)

> **FICTIONAL DEMO DATA. SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> Baobab Coast Finance does not exist. Its name, domain and tickers are invented and imitate no real company or product; its jurisdiction is a real place used only as a plain fact. It is not licensed, registered or supervised by anyone.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `baobab-coast-finance`                                                                                   |
| Legal entity name                           | Baobab Coast Finance (fictional; no legal entity)                                                        |
| Jurisdiction                                | Mauritius (a real place, as a plain fact; the issuer is fictional)                                       |
| Kind of firm (fiction)                      | Investment-dealer applicant of a category licensed in Mauritius                                          |
| Fictional domain                            | `baobab-coast-finance.example` (a reserved example domain; no website or mailbox exists)                 |
| Documentation                               | This dossier                                                                                             |
| Issuer status                               | `rejected`: a registrar rejected it before it issued anything (terminal)                                 |
| Authorized asset categories                 | Synthetic money-market fund (test only)                                                                  |
| Issuer-controlled contracts and admin roles | None: the issuer was rejected before it issued anything                                                  |
| Custodian / service providers               | None                                                                                                     |
| Audit / attestation providers               | None                                                                                                     |
| Contact and incident information            | Simulated desk contact: desk@baobab-coast-finance.example (a reserved example domain; no mailbox exists) |
| `synthetic` / `verification_status`         | `true` / `unverified`                                                                                    |

## Story (fiction)

A fictional applicant the registrar rejected before it issued anything (terminal): the story is a failed review. It has no tokens, like Vantage Credit.

## Why there are no tokens

A rejected issuer's tokens could never be activated, so the seed registers none. The review that rejected it is a story: no review process exists, only a registrar moving a record between statuses.

## Representations issued

None.

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with its "1 whole token =" column.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity, licensing, jurisdiction. `unverified` records that no attestation was recorded.
