# ADR 0002: Contract layout and event model

- **Status:** Accepted
- **Date:** 2026-11-07
- **Brief items:** §13.1, §13.2, §24 item 2
- **Related:** [0003](0003-admin-roles-and-pause.md), [0007](0007-conversion-via-ft-transfer-call.md)

## Context

Brief §13.1 says not to split deployments without a clear security or upgradeability reason. Conversion needs the registry, compatibility and policy checks to run synchronously inside `ft_on_transfer`; cross-contract calls would turn those checks into asynchronous promises and create time-of-check/time-of-use gaps.

## Decision

Two deployable contracts, Rust, `near-sdk` with `near-contract-standards`:

1. **`synthetic-token`:** NEP-141 + metadata + storage management. Owner `mint`/`burn`, testnet `faucet_mint` (per-call cap, per-account cooldown, owner can disable), pause. Deployed twice (TGOLD-A, TGOLD-B). It knows nothing about Pontis.
2. **`pontis-core`:** one contract with internal modules:

   | Module          | Responsibility                                                                |
   | --------------- | ----------------------------------------------------------------------------- |
   | `roles`         | `owner`, `registrar`, `compat_approver`, `pauser`; pause flags                |
   | `issuers`       | issuer records and status                                                     |
   | `assets`        | canonical claims and token representations (separate entities), evidence refs |
   | `compatibility` | relationships, versions, append-only history                                  |
   | `policy`        | per-representation allowlist, `policy_version`                                |
   | `conversion`    | `ft_on_transfer`, quote verification, nonce set, payout and callback          |
   | `vault`         | per-representation inventory, funding, owner withdrawal                       |
   | `events`        | NEP-297 event emission                                                        |

A settlement manager (async cross-chain state) is not built; see [0010](0010-deferred-scope.md).

Rules for every state-changing method: check caller role, check relevant pause flag, mutate state, emit an event. State is updated **before** any promise is created; callbacks only resolve outcomes.

## Event model

NEP-297 logs: `EVENT_JSON:{"standard":"pontis","version":"1.0.0","event":"<name>","data":{...}}`. `data` is a single JSON object per event (amended in B5; the first draft said an array, but `near-sdk` event enums serialise one object). Amounts are decimal strings, timestamps are milliseconds since epoch, account IDs are strings.

| Event                                                                                                   | Emitted when                                                                  |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `role_granted`, `role_revoked`                                                                          | role set changes                                                              |
| `ownership_transfer_proposed`, `ownership_transferred`                                                  | two-step ownership change (added in B5)                                       |
| `paused`, `unpaused`                                                                                    | global or per-asset pause changes (`scope`, `target`)                         |
| `issuer_registered`, `issuer_status_changed`                                                            | issuer lifecycle                                                              |
| `canonical_asset_registered`, `canonical_asset_status_changed`                                          | claim lifecycle                                                               |
| `representation_registered`, `representation_status_changed`                                            | representation lifecycle                                                      |
| `evidence_added`                                                                                        | evidence reference attached                                                   |
| `compatibility_proposed`, `compatibility_approved`, `compatibility_rejected`, `compatibility_suspended` | relationship lifecycle; carries `version`                                     |
| `policy_updated`, `allowlist_updated`                                                                   | policy rules or membership change; carries `policy_version`                   |
| `quote_signer_set`, `fee_updated`                                                                       | conversion config                                                             |
| `vault_funded`, `vault_withdrawn`                                                                       | inventory movement                                                            |
| `conversion_completed`                                                                                  | payout succeeded; carries the full breakdown                                  |
| `conversion_failed`                                                                                     | payout failed and input refunded; carries reason                              |
| `conversion_rejected`                                                                                   | validation failed and input refunded in `ft_on_transfer`; carries reason code |

The indexer is idempotent on `(receipt_id, log_index)`. Event schemas live next to the contract code and in `packages/api-types`.

## Consequences

- Validation is atomic with execution; no race between check and payout.
- A single contract is a larger blast radius than separate contracts. Mitigated by role separation, pause controls and the capped testnet-only inventory.
- Rejections emit `conversion_rejected` so reconciliation can account for refunded transfers that never became conversions.

## Alternatives considered

- _Separate registry, compatibility and vault contracts:_ rejected for the MVP; synchronous cross-contract views are not available in NEAR, so each check would add a callback hop.
- _Upgradeable proxy:_ rejected. Testnet contracts are redeployed; see [0003](0003-admin-roles-and-pause.md) for key handling.
