# Architecture decision records

Decisions that settle the open items in brief §23–24. Any change to a decision needs a **new ADR** that supersedes the old one; do not edit an accepted ADR to change its meaning.

| #                                                       | Title                                                                       | Brief items                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| [0001](0001-synthetic-claim-and-units.md)               | Synthetic claim, units and pricing                                          | §24.1, 2, 7                 |
| [0002](0002-contract-layout-and-events.md)              | Contract layout and event model                                             | §13.1, §13.2                |
| [0003](0003-admin-roles-and-pause.md)                   | Admin roles and pause controls                                              | §24.4                       |
| [0004](0004-compatibility-and-policy-versioning.md)     | Compatibility and policy versioning                                         | §6.5–6.7, §7.4              |
| [0005](0005-allowlist-eligibility.md)                   | Allowlist eligibility                                                       | §24.5                       |
| [0006](0006-quote-signing-model.md)                     | Quote signing model                                                         | §7.4, §13.4                 |
| [0007](0007-conversion-via-ft-transfer-call.md)         | Conversion via `ft_transfer_call`                                           | §7.1, §15.2                 |
| [0008](0008-vault-inventory-and-funding.md)             | Vault inventory and funding model                                           | §24.3, 8                    |
| [0009](0009-synthetic-evidence-labelling.md)            | Synthetic and unverified evidence labelling                                 | §24.6, §16.1                |
| [0010](0010-deferred-scope.md)                          | Deferred scope                                                              | §24.9–14                    |
| [0011](0011-indexer.md)                                 | Event indexer                                                               | §7.4, §13.2                 |
| [0012](0012-reconciliation.md)                          | Reconciliation                                                              | §7.4, §24.3                 |
| [0013](0013-api-hardening.md)                           | API hardening                                                               | §10.1, §14.3                |
| [0014](0014-scope-expansion-beyond-mvp.md)              | Scope expansion beyond the MVP                                              | expansion brief §0, §2, §14 |
| [0015](0015-market-data-platform.md)                    | Market data platform                                                        | expansion brief §12         |
| [0016](0016-price-reference-and-route-guards.md)        | Price reference and route guards                                            | expansion brief §4.2        |
| [0017](0017-corporate-actions-and-multiplier-epochs.md) | Corporate actions and multiplier epochs                                     | expansion brief §4.3        |
| [0018](0018-asset-lifecycle-and-nav-strikes.md)         | Asset lifecycle and NAV strikes                                             | expansion brief §4.3        |
| [0019](0019-phase-3-scope-and-demo-issuers.md)          | Phase 3 scope: wallet sign-in and a role registry; demo issuers stay mocked | expansion brief §5, §14     |
| [0020](0020-custody-reserves-and-redemption.md)         | Custody registry, proof of reserve, gated mint and redemption               | expansion brief §6, §14     |
| [0021](0021-issuer-onboarding-and-attestations.md)      | Issuer onboarding and authenticated attestations                            | expansion brief §5          |
| [0022](0022-evm-bridge-foundation.md)                   | EVM permissioned token foundation                                           | expansion brief §8          |

## Format

```markdown
# ADR NNNN: Title

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD
- **Brief items:** sections or §24 items settled
- **Related:** other ADRs

## Context

## Decision

## Consequences
```

Other Phase 0 documents: [threat model](../threat-model/mvp.md), [what is mocked](../architecture/deliberately-mocked.md), [asset dossiers](../asset-dossiers/).
