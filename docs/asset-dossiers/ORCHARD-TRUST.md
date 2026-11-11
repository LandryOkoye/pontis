# Dossier: ORCHARD-TRUST (issuer and its representation)

> **SIMULATED ISSUER. SYNTHETIC TEST TOKEN. UNBACKED. NOT VERIFIED BY ANYONE.**
> Orchard Trust does not exist. It is a fictional issuer whose simulated attestation "lapsed", so the demo catalogue shows a `deprecated` issuer.

- **Record types:** issuer (brief §6.2) and token representation (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `orchard-trust`                                                                               |
| Legal entity name                           | Orchard Trust (fictional; no legal entity)                                                    |
| Jurisdiction                                | None                                                                                          |
| Documentation                               | This dossier                                                                                  |
| Issuer status                               | `deprecated`: it was `active` while the catalogue was seeded, then a registrar deprecated it  |
| Authorized asset categories                 | Treasury fund (synthetic, test only)                                                          |
| Issuer-controlled contracts and admin roles | The `synthetic-token` contract below; the owner account controls mint, burn, pause and faucet |
| Custodian / service providers               | None                                                                                          |
| Audit / attestation providers               | None                                                                                          |
| Contact and incident information            | Pontis project team (testnet only)                                                            |
| `synthetic` / `verification_status`         | `true` / `issuer_attested`                                                                    |

## The lapsed attestation is a narrative

In the fiction, this issuer provided its own attestation, which lapsed on 2026-10-31 without renewal, and the registrar deprecated the issuer. **That is a story, not a mechanism.** The registry has no attestation expiry: nothing checked a date, and nothing downgraded the record automatically. `verification_status` stays `issuer_attested` because records cannot be edited after registration; the only on-chain fact is that a registrar moved the issuer to `deprecated`, a terminal status.

## Representation issued

| Representation | Claim      | Decimals | 1 whole token =  | Multiplier per smallest unit | Record status |
| -------------- | ---------- | -------- | ---------------- | ---------------------------- | ------------- |
| `tustb-o`      | `syn-ustb` | 8        | 1 canonical unit | `1 / 10^8`                   | `active`      |

`synthetic` `true`, `verification_status` `issuer_attested`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in `pontis-core`, no custody, backing or redemption, no bridge.

`tustb-o` was registered and activated while the issuer was `active`, and its relationship with `tustb-h` was approved then. Deprecating the issuer does not change either record, but the contract treats a representation as executable only when its issuer is `active`, so no conversion involving `tustb-o` can run. The vault was funded before the deprecation and the inventory stays there.

## What was checked, by whom, when

- **Checked:** that decimals (8) and the multiplier `1 / 10^8` are consistent with "1 whole token = 1 canonical unit".
- **By:** the Pontis project team (self-attestation).
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity. `issuer_attested` records that evidence was provided; it is not a verification.
