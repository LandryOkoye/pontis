# Dossier: PENINSULA-ORIENT-ASSETS (issuer and its representations)

> **FICTIONAL DEMO DATA. SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> Peninsula Orient Assets does not exist. Its name, domain and tickers are invented and imitate no real company or product; its jurisdiction is a real place used only as a plain fact. It is not licensed, registered or supervised by anyone.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** `issuer_provided`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** `full` and above (`--catalogue=full`)
- **Deployed account IDs:** `<representation_id>.<deployer>`, recorded in `docs/architecture/deployment-record.md` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

| Field                                       | Value                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `issuer_id`                                 | `peninsula-orient-assets`                                                                                   |
| Legal entity name                           | Peninsula Orient Assets (fictional; no legal entity)                                                        |
| Jurisdiction                                | Hong Kong (a real place, as a plain fact; the issuer is fictional)                                          |
| Kind of firm (fiction)                      | Asset manager of a category licensed in Hong Kong                                                           |
| Fictional domain                            | `peninsula-orient-assets.example` (a reserved example domain; no website or mailbox exists)                 |
| Documentation                               | This dossier                                                                                                |
| Issuer status                               | `restricted`: registered, review pending, never activated                                                   |
| Authorized asset categories                 | Synthetic tokenized equity (test only); Synthetic equity basket or index tracker (test only)                |
| Issuer-controlled contracts and admin roles | The 2 `synthetic-token` contracts below; the owner account controls mint, burn, pause and faucet            |
| Custodian / service providers               | None                                                                                                        |
| Audit / attestation providers               | None                                                                                                        |
| Contact and incident information            | Simulated desk contact: desk@peninsula-orient-assets.example (a reserved example domain; no mailbox exists) |
| `synthetic` / `verification_status`         | `true` / `unverified`                                                                                       |

## Story (fiction)

A fictional applicant whose review is still open: registered, never activated, so its two tokens are registered and restricted. Like Meridian Assets it shows pending tokens.

## Why the tokens are pending

The contract activates a representation only while its issuer is `active`. This issuer was registered with its dossier but never activated, so its tokens are registered and stay `restricted`: they exist in the registry, can be minted by the owner and allowlisted, and cannot be activated, approved into a pair or converted.

## Representations issued

| Representation | Claim                    | Decimals | 1 whole token =       | Multiplier per smallest unit | Record status                 | Tier   | Notes                                                                                                                                       |
| -------------- | ------------------------ | -------- | --------------------- | ---------------------------- | ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tqfb-o`       | `syn-stock-quillfeather` | 8        | 1 / 10 canonical unit | `1 / 10^9`                   | `restricted` (cannot convert) | `full` | Registered but restricted: its issuer's review is pending, so it cannot be activated; Pair with `tqfb-p`: DIRECT_EQUIVALENT, proposed only  |
| `tbskt-o`      | `syn-basket-tech`        | 8        | 1 canonical unit      | `1 / 10^8`                   | `restricted` (cannot convert) | `full` | Registered but restricted: its issuer's review is pending, so it cannot be activated; Pair with `tbskt-c`: DIRECT_EQUIVALENT, proposed only |

All: `synthetic` `true`, `verification_status` `unverified`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in `pontis-core` ([ADR 0005](../decisions/0005-allowlist-eligibility.md)), no custody, backing or redemption, no bridge (`bridge_status` `none`).

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with its "1 whole token =" column.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** 2026-11-11, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity, licensing, jurisdiction. `unverified` records that no attestation was recorded.
