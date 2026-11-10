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

## Amendment (what the registry does and does not vouch for)

The contract stores and checks registry data; it does not authenticate any of it. For the synthetic MVP that is acceptable, provided no field is presented as a guarantee it is not.

| Field or status                                    | What the contract does                                                                                                  | What it does not do                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Evidence `uri`, `sha256`                           | Checks length and that the hash is 64 lowercase hex characters; records who attached it and when                        | Fetch the URI, compare the hash with any content, or prove the evidence says anything true about an asset or an issuer           |
| Evidence `provenance`                              | Stores the label a registrar supplied                                                                                   | Check who produced the evidence. `issuer_provided` and `third_party_attested` are claims recorded by the registrar               |
| `verification_status` `issuer_attested`            | Requires at least one evidence reference                                                                                | Verify anything                                                                                                                  |
| `verification_status` `third_party_attested`       | Requires evidence labelled `third_party_attested`                                                                       | Authenticate a third party. It means "a registrar recorded a third-party attestation", not that one was verified                 |
| `verification_status` `independently_verified`     | **Refuses it** at registration and activation, and refuses evidence labelled `independently_verified`                   | There is no authenticated verifier, so the status is reserved for one. The enum value and label stay in the data model for later |
| Issuer `authorized_categories`                     | **Enforced:** a representation can be registered and activated only if its canonical asset's category is in the list    | Prove the issuer is entitled to that category in any legal sense: the list is entered by a registrar                             |
| Issuer `controlled_accounts`                       | **Enforced when non-empty:** a representation's token account must be in the list. An empty list declares no constraint | Prove the issuer controls those accounts. Nothing binds the account to the issuer; the registrar asserts it                      |
| `synthetic`, `unverified` flags, `jurisdiction`... | Stored and returned                                                                                                     | Anything: informational labels (ADR 0009 rule 1)                                                                                 |

Issuer authorization is checked on registration and again on activation. Neither list can change after registration (there are no update methods), so a mismatch means rejecting the record and registering a new one.

**Production requirements, not built.** Real RWA onboarding needs at least: issuer and verifier attestations that are signed and checked on chain or by an accountable process; proof that an issuer controls the accounts it lists (for example a signed message or a function-call key challenge from each account); evidence content that is fetched and compared with its hash by someone other than the issuer; enforcement of an eligibility regime per representation; and separate roles for registering, attesting and approving so one operator cannot do all three. None of this exists here, and the MVP must not be described as if it did.
