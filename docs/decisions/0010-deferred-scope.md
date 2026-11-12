# ADR 0010: Deferred scope

- **Status:** Accepted; items 9, 10, 11 and the "also deferred" list are superseded in part by [0014](0014-scope-expansion-beyond-mvp.md)
- **Date:** 2026-11-07
- **Brief items:** §24 items 9–14, §18.2, §26
- **Related:** [0005](0005-allowlist-eligibility.md)

## Context

BuildPlan.md says ideas for out-of-scope features go into `docs/decisions/` and are not built. This ADR records the brief's remaining open decisions and what the MVP does with each.

## Decisions

| Brief item          | Decision                                                                                                                                                      | Precondition to revisit                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 9. External chain   | None. No bridge, no Chain Signatures, no cross-chain state machine.                                                                                           | Verified route support for bridge, signing and proofs on one chosen chain; threat model for that route (brief §16.3) |
| 10. NEAR Intents    | Not integrated.                                                                                                                                               | Target assets and routes confirmed supported; solver integration design                                              |
| 11. Confidentiality | Not built. No private orders, dark-pool matcher, confidential payloads or selective disclosure.                                                               | Standard route works; a supported integration is confirmed; key custody and disclosure model reviewed (brief §16.4)  |
| 12. MCP / agents    | Not built in the MVP. If added, read-only tools first (assets, compatibility, route comparison, quote read). No write tools, no agent-initiated transactions. | Written agent authorization model (brief §10.4), bounded permissions, human approval                                 |
| 13. Protocol token  | None.                                                                                                                                                         | A concrete need that fees and roles do not meet, plus legal review                                                   |
| 14. Legal scope     | Testnet and synthetic assets only. No real RWA, production funds or regulated activity.                                                                       | Jurisdiction- and asset-specific legal review (brief §16.5)                                                          |

Also deferred without separate brief items: market-priced exchange, multi-solver markets, lifecycle engine, settlement manager, issuer adapters, a real KYC/eligibility provider.

## Consequences

- The reviewer rule in BuildPlan §11 applies: any PR that builds one of these items is rejected unless a new ADR supersedes this one.
- The data model leaves room (for example the `EligibilityProvider` seam in [0005](0005-allowlist-eligibility.md)) without implementing the deferred features.
