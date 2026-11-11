# Asset dossiers

Every record the seeds register (an issuer, a canonical asset, a representation or a relationship) carries an evidence reference whose SHA-256 is computed from one of these files at registration ([ADR 0009](../decisions/0009-synthetic-evidence-labelling.md)). Editing a dossier changes its hash, so a changed dossier needs new evidence on chain.

**Everything here is fiction.** No asset, issuer, custodian, fund, property, loan or company exists. Each dossier has provenance `issuer_provided`: the issuers are the project itself, and nothing was checked by a third party. `issuer_attested` in a trust state means only that a registrar recorded that the issuer supplied the dossier; the contract does not read it, and `independently_verified` is refused by the contract.

## MVP seed (`pnpm --filter @pontis/scripts seed`)

| Dossier                       | Record                                 |
| ----------------------------- | -------------------------------------- |
| [SYN-GOLD-OZ](SYN-GOLD-OZ.md) | Canonical asset `syn-gold-oz`          |
| [TGOLD-A](TGOLD-A.md)         | Issuer `synthetic-issuer-a`, `tgold-a` |
| [TGOLD-B](TGOLD-B.md)         | Issuer `synthetic-issuer-b`, `tgold-b` |

## Demo catalogue (`pnpm --filter @pontis/scripts seed-catalogue`)

Canonical assets, each the evidence of its claim and of the relationship between its representations:

| Dossier                     | Canonical asset | What it stands for (fiction)                                | Representations      |
| --------------------------- | --------------- | ----------------------------------------------------------- | -------------------- |
| [SYN-ACME](SYN-ACME.md)     | `syn-acme`      | One share of a fictional listed company                     | `tacme-h`, `tacme-m` |
| [SYN-USTB](SYN-USTB.md)     | `syn-ustb`      | One unit of a fictional Treasury fund (NAV style)           | `tustb-h`, `tustb-o` |
| [SYN-VILLA](SYN-VILLA.md)   | `syn-villa`     | One fictional property record, unit supply 1, bridge-only   | `tvilla-1`           |
| [SYN-CREDIT](SYN-CREDIT.md) | `syn-credit`    | One fictional private-credit note with maturity terms       | `tcredit-1`          |
| [SYN-USD](SYN-USD.md)       | `syn-usd`       | One fictional US dollar, a quote asset                      | `tusd-h`             |
| [SYN-NOVA](SYN-NOVA.md)     | `syn-nova`      | A fictional share with a stock split announced, not applied | `tnova-m`            |

Issuers, each the evidence of the issuer and of its representations, in four different trust states:

| Dossier                                     | Issuer               | Status after seeding | `verification_status` | Representations                                         |
| ------------------------------------------- | -------------------- | -------------------- | --------------------- | ------------------------------------------------------- |
| [HALCYON-SECURITIES](HALCYON-SECURITIES.md) | `halcyon-securities` | `active`             | `issuer_attested`     | `tacme-h`, `tustb-h`, `tvilla-1`, `tcredit-1`, `tusd-h` |
| [MERIDIAN-ASSETS](MERIDIAN-ASSETS.md)       | `meridian-assets`    | `restricted`         | `unverified`          | `tacme-m`, `tnova-m` (both `restricted`)                |
| [ORCHARD-TRUST](ORCHARD-TRUST.md)           | `orchard-trust`      | `deprecated`         | `issuer_attested`     | `tustb-o` (`active`, but not executable)                |
| [VANTAGE-CREDIT](VANTAGE-CREDIT.md)         | `vantage-credit`     | `rejected`           | `unverified`          | none                                                    |

The statuses are what the seed leaves on chain. The stories behind `deprecated` (an attestation that lapsed) and `rejected` (a failed review) are narrative: the contract has no attestation expiry and no review process, only a registrar moving a record between statuses.

## Writing a dossier

Follow an existing one. State what is synthetic at the top, fill every field of the record (`None` is an answer), say what was checked, by whom and when, and keep deployed account IDs out so the hash stays stable. The catalogue data that must agree with a dossier is in [`scripts/lib/catalogue.ts`](../../scripts/lib/catalogue.ts).
