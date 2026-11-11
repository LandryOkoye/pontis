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

<!-- BEGIN generated: rich catalogue (scripts/gen-dossiers.ts) -->

## Rich demo catalogue (`--catalogue=demo` and `--catalogue=full`)

15 more invented issuers in 15 jurisdictions and 27 more claims, [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md) section 3. **All of it is fictional demo data:** every name, domain (under the reserved `.example` suffix) and ticker is invented and imitates no real company, fund or token; jurisdictions are real places used as plain facts; nothing is licensed, backed, custodied or verified. These dossiers are generated from [`scripts/lib/catalogue-rich-*.ts`](../../scripts/lib) by `pnpm --filter @pontis/scripts gen-dossiers`, and a test fails if one drifts from the data. The `tier` column is the smallest tier that includes the record: `demo` records are in both tiers, `full` records only in `full`; `mvp` seeds none of them.

Claims, each the evidence of its claim and of the relationships between its wrappers:

| Dossier                                             | Canonical asset          | Category                       | Tier   | Representations          |
| --------------------------------------------------- | ------------------------ | ------------------------------ | ------ | ------------------------ |
| [SYN-TBILL-3M](SYN-TBILL-3M.md)                     | `syn-tbill-3m`           | Treasury fund                  | `demo` | `ttb3m-m`, `ttb3m-e`     |
| [SYN-TBILL-LADDER](SYN-TBILL-LADDER.md)             | `syn-tbill-ladder`       | Treasury fund                  | `full` | `tlad-e`                 |
| [SYN-MMF-USD](SYN-MMF-USD.md)                       | `syn-mmf-usd`            | money-market fund              | `demo` | `tmmfusd-m`, `tmmfusd-e` |
| [SYN-MMF-EUR](SYN-MMF-EUR.md)                       | `syn-mmf-eur`            | money-market fund              | `full` | `tmmfeur-e`, `tmmfeur-c` |
| [SYN-IGCORP](SYN-IGCORP.md)                         | `syn-igcorp`             | investment-grade bond fund     | `demo` | `tigc-c`, `tigc-r`       |
| [SYN-IDX-GLOBAL](SYN-IDX-GLOBAL.md)                 | `syn-idx-global`         | equity basket or index tracker | `demo` | `tidxg-c`, `tidxg-p`     |
| [SYN-BASKET-TECH](SYN-BASKET-TECH.md)               | `syn-basket-tech`        | equity basket or index tracker | `full` | `tbskt-c`, `tbskt-o`     |
| [SYN-VC-FUND](SYN-VC-FUND.md)                       | `syn-vc-fund`            | venture or private-equity fund | `full` | `tvcf-t`                 |
| [SYN-PE-FUND](SYN-PE-FUND.md)                       | `syn-pe-fund`            | venture or private-equity fund | `full` | `tpef-t`, `tpef-c`       |
| [SYN-CRE-OFFICE](SYN-CRE-OFFICE.md)                 | `syn-cre-office`         | commercial real-estate fund    | `demo` | `tcreo-r`                |
| [SYN-CRE-LOGISTICS](SYN-CRE-LOGISTICS.md)           | `syn-cre-logistics`      | commercial real-estate fund    | `full` | `tcrel-r`, `tcrel-t`     |
| [SYN-RESI-RENTAL](SYN-RESI-RENTAL.md)               | `syn-resi-rental`        | residential real estate        | `full` | `tresi-r`                |
| [SYN-GOLD-KG](SYN-GOLD-KG.md)                       | `syn-gold-kg`            | precious-metal claim           | `demo` | `tgkg-a`, `tgkg-d`       |
| [SYN-SILVER-OZ](SYN-SILVER-OZ.md)                   | `syn-silver-oz`          | precious-metal claim           | `full` | `tsil-a`, `tsil-w`       |
| [SYN-OIL-BBL](SYN-OIL-BBL.md)                       | `syn-oil-bbl`            | industrial commodity claim     | `full` | `toil-d`, `toil-a`       |
| [SYN-COPPER-T](SYN-COPPER-T.md)                     | `syn-copper-t`           | industrial commodity claim     | `full` | `tcu-d`, `tcu-w`         |
| [SYN-CARBON-NATURE](SYN-CARBON-NATURE.md)           | `syn-carbon-nature`      | carbon credit                  | `demo` | `tcbn-v`, `tcbn-d`       |
| [SYN-CARBON-ENG](SYN-CARBON-ENG.md)                 | `syn-carbon-eng`         | carbon credit                  | `full` | `tcbe-w`                 |
| [SYN-ART-CANVAS](SYN-ART-CANVAS.md)                 | `syn-art-canvas`         | art or collectible             | `demo` | `tart-m`                 |
| [SYN-RESI-FLAT](SYN-RESI-FLAT.md)                   | `syn-resi-flat`          | residential real estate        | `full` | `tflat-m`                |
| [SYN-NOTE-SME](SYN-NOTE-SME.md)                     | `syn-note-sme`           | private-credit note            | `demo` | `tsme-b`                 |
| [SYN-NOTE-TRADE](SYN-NOTE-TRADE.md)                 | `syn-note-trade`         | private-credit note            | `full` | `ttrd-b`                 |
| [SYN-STOCK-QUILLFEATHER](SYN-STOCK-QUILLFEATHER.md) | `syn-stock-quillfeather` | tokenized equity               | `demo` | `tqfb-p`, `tqfb-o`       |
| [SYN-STOCK-TARNOWSKI](SYN-STOCK-TARNOWSKI.md)       | `syn-stock-tarnowski`    | tokenized equity               | `full` | `ttgu-p`                 |
| [SYN-STOCK-MARLOWE](SYN-STOCK-MARLOWE.md)           | `syn-stock-marlowe`      | tokenized equity               | `full` | `tmfr-p`                 |
| [SYN-EUR](SYN-EUR.md)                               | `syn-eur`                | stable-value token             | `demo` | `teur-m`, `teur-e`       |
| [SYN-JPY](SYN-JPY.md)                               | `syn-jpy`                | stable-value token             | `full` | `tjpy-s`, `tjpy-m`       |

Issuers, each the evidence of the issuer and of its representations (record status in brackets):

| Dossier                                                     | Issuer                       | Jurisdiction         | Status after seeding | `verification_status` | Tier   | Representations                                                  |
| ----------------------------------------------------------- | ---------------------------- | -------------------- | -------------------- | --------------------- | ------ | ---------------------------------------------------------------- |
| [ALPENROSE-FIDUCIARY](ALPENROSE-FIDUCIARY.md)               | `alpenrose-fiduciary`        | Switzerland          | `active`             | `issuer_attested`     | `demo` | `tgkg-a`, `tsil-a`, `toil-a` (active)                            |
| [MERLION-HARBOUR-TRUST](MERLION-HARBOUR-TRUST.md)           | `merlion-harbour-trust`      | Singapore            | `active`             | `issuer_attested`     | `demo` | `ttb3m-m`, `tmmfusd-m`, `teur-m`, `tjpy-m` (active)              |
| [COBALTINE-FUND-SERVICES](COBALTINE-FUND-SERVICES.md)       | `cobaltine-fund-services`    | Luxembourg           | `active`             | `issuer_attested`     | `demo` | `tmmfeur-c`, `tigc-c`, `tidxg-c`, `tbskt-c`, `tpef-c` (active)   |
| [EMERALD-TERN-CAPITAL](EMERALD-TERN-CAPITAL.md)             | `emerald-tern-capital`       | Ireland              | `active`             | `issuer_attested`     | `demo` | `ttb3m-e`, `tlad-e`, `tmmfusd-e`, `tmmfeur-e`, `teur-e` (active) |
| [KITTIWAKE-CAYMAN-PARTNERS](KITTIWAKE-CAYMAN-PARTNERS.md)   | `kittiwake-cayman-partners`  | Cayman Islands       | `restricted`         | `issuer_attested`     | `full` | `tcrel-t`, `tvcf-t`, `tpef-t` (active)                           |
| [PENNYWHISTLE-SECURITIES](PENNYWHISTLE-SECURITIES.md)       | `pennywhistle-securities`    | United Kingdom       | `active`             | `issuer_attested`     | `demo` | `tqfb-p`, `ttgu-p`, `tmfr-p`, `tidxg-p` (active, deprecated)     |
| [RHEINKONTOR-DIGITAL](RHEINKONTOR-DIGITAL.md)               | `rheinkontor-digital`        | Germany              | `active`             | `issuer_attested`     | `demo` | `tigc-r`, `tcreo-r`, `tcrel-r`, `tresi-r` (active)               |
| [SAKURA-MEADOW-TRUST](SAKURA-MEADOW-TRUST.md)               | `sakura-meadow-trust`        | Japan                | `active`             | `unverified`          | `full` | `tjpy-s`, `tusd-s` (active)                                      |
| [PENINSULA-ORIENT-ASSETS](PENINSULA-ORIENT-ASSETS.md)       | `peninsula-orient-assets`    | Hong Kong            | `restricted`         | `unverified`          | `full` | `tqfb-o`, `tbskt-o` (restricted)                                 |
| [SAFFRON-CRESCENT-CAPITAL](SAFFRON-CRESCENT-CAPITAL.md)     | `saffron-crescent-capital`   | United Arab Emirates | `active`             | `issuer_attested`     | `demo` | `tgkg-d`, `toil-d`, `tcu-d`, `tcbn-d` (active)                   |
| [VERDE-AMAZONAS-ATIVOS](VERDE-AMAZONAS-ATIVOS.md)           | `verde-amazonas-ativos`      | Brazil               | `active`             | `issuer_attested`     | `demo` | `tcbn-v` (active)                                                |
| [BOREAL-LARCH-CREDIT](BOREAL-LARCH-CREDIT.md)               | `boreal-larch-credit`        | Canada               | `active`             | `issuer_attested`     | `demo` | `tsme-b`, `ttrd-b`, `tcredit-b` (active)                         |
| [WATTLEBIRD-CAPITAL](WATTLEBIRD-CAPITAL.md)                 | `wattlebird-capital`         | Australia            | `deprecated`         | `issuer_attested`     | `full` | `tsil-w`, `tcu-w`, `tcbe-w` (active)                             |
| [MAISON-QUILLON-COLLECTIONS](MAISON-QUILLON-COLLECTIONS.md) | `maison-quillon-collections` | France               | `active`             | `issuer_attested`     | `demo` | `tart-m`, `tflat-m` (active)                                     |
| [BAOBAB-COAST-FINANCE](BAOBAB-COAST-FINANCE.md)             | `baobab-coast-finance`       | Mauritius            | `rejected`           | `unverified`          | `full` | none                                                             |

The statuses are what the seed leaves on chain. The stories behind them (a lapsed attestation, a suspension, a pending review, a failed review, a delisting, a split scheduled in a dossier only, a redemption-gated note) are narrative: the contract has no attestation expiry, no review process and no delisting without two accounts, only a registrar moving a record between statuses.

<!-- END generated: rich catalogue -->

## Writing a dossier

Follow an existing one. State what is synthetic at the top, fill every field of the record (`None` is an answer), say what was checked, by whom and when, and keep deployed account IDs out so the hash stays stable. The catalogue data that must agree with a dossier is in [`scripts/lib/catalogue.ts`](../../scripts/lib/catalogue.ts).
