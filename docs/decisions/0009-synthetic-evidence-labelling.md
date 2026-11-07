# ADR 0009: Synthetic and unverified evidence labelling

- **Status:** Accepted
- **Date:** 2026-11-07
- **Brief items:** §24 item 6, §6.2–6.4, §15.1, §16.1, §19.1
- **Related:** [0001](0001-synthetic-claim-and-units.md)

## Context

Brief §16.1 forbids "verified" without stating what was checked, by whom, when and within what limits. The MVP assets have no backing at all, so the data model has to say so explicitly rather than leave verification fields empty.

## Decision

1. **Every record carries explicit flags.** Issuers, canonical assets and representations include `synthetic: bool` and `verification_status`. All MVP records are `synthetic: true` with `verification_status = "unverified"`. These are data, not UI copy: the contract stores them, the API returns them and the web app must render them.
2. **Evidence reference** (stored on-chain, mirrored in `asset_evidence`):

   | Field          | Meaning                                                                |
   | -------------- | ---------------------------------------------------------------------- |
   | `uri`          | where the evidence lives (for MVP, the repository path of the dossier) |
   | `sha256`       | hex digest of the evidence content at registration                     |
   | `provenance`   | `issuer_provided`, `third_party_attested` or `independently_verified`  |
   | `description`  | what the evidence is and what it covers                                |
   | `added_by`     | account that attached it                                               |
   | `timestamp_ms` | when it was attached                                                   |

3. **MVP evidence is the dossiers** in [`docs/asset-dossiers/`](../asset-dossiers/). Their provenance is `issuer_provided`, because the synthetic issuers are the project itself, and each dossier states that nothing was checked by anyone else. The seed script computes each dossier's `sha256` at registration time, so editing a dossier requires attaching new evidence.
4. **Completeness gate.** A record cannot be set `active` unless required fields and at least one evidence reference are present (brief §19.1). The contract enforces this; the API and UI also show missing items.
5. **Language rules.**
   - Never use "verified" on its own; always say what was checked, by whom and when.
   - Never describe the asset as backed, redeemable or custodied.
   - Never call the operation a bridge or an exchange; it is a **parity conversion of a synthetic test asset**.
6. **Evidence separation in the UI.** Issuer-provided, third-party attested and independently verified evidence are shown in separate groups, even though the MVP only has the first.

## Consequences

- The label survives every layer, so a screenshot of any screen is unambiguous.
- Adding real evidence later does not need a data-model change.
