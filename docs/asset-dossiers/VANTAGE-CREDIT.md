# Dossier: VANTAGE-CREDIT (issuer)

> **SIMULATED ISSUER. NO TOKEN. NOT VERIFIED BY ANYONE.**
> Vantage Credit does not exist. It is a fictional applicant whose application was rejected, so the demo catalogue shows a `rejected` issuer.

- **Record type:** issuer (brief §6.2)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md)

## Issuer record

| Field                                       | Value                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `issuer_id`                                 | `vantage-credit`                                                            |
| Legal entity name                           | Vantage Credit (fictional; no legal entity)                                 |
| Jurisdiction                                | None                                                                        |
| Documentation                               | This dossier                                                                |
| Issuer status                               | `rejected`: registered, then rejected by a registrar; terminal              |
| Authorized asset categories                 | Private-credit note (synthetic, test only), as requested in the application |
| Issuer-controlled contracts and admin roles | None. No token contract was deployed for it.                                |
| Custodian / service providers               | None                                                                        |
| Audit / attestation providers               | None                                                                        |
| Contact and incident information            | Pontis project team (testnet only)                                          |
| `synthetic` / `verification_status`         | `true` / `unverified`                                                       |

## Why it was rejected (narrative)

In the fiction, the application to issue private-credit notes was rejected during review for insufficient documentation. **That is a story.** The only on-chain fact is the status change to `rejected` by a registrar. Rejection is terminal: the record accepts no further evidence and cannot be activated, so a corrected application would be a new issuer record.

The dossier was attached as evidence before the rejection. Nothing was verified, so `verification_status` stays `unverified`. The issuer has no representation: a representation under a rejected issuer could never be activated.

## What was checked, by whom, when

- **Checked:** nothing beyond the internal consistency of this record.
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** everything else.
