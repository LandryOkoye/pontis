# Phase 2 report: corporate actions, lifecycle and NAV strikes (contract)

Implements [ADR 0017](../decisions/0017-corporate-actions-and-multiplier-epochs.md) and [ADR 0018](../decisions/0018-asset-lifecycle-and-nav-strikes.md) in `contracts/pontis-core`, on top of the price guards ([phase-2-guards.md](phase-2-guards.md)). The API, indexer, web and TypeScript mirrors are separate work.

## What shipped

| Piece                                                                                                                                                                                                                   | Real, testnet or simulated                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `CorporateAction` record: propose, add evidence, approve, cancel (registrar proposes, compat approver approves, proposer differs from approver)                                                                         | Real on-chain logic; the facts are registrar-entered claims    |
| Multiplier schedule per representation (genesis epoch at registration), effective-multiplier lookup, `apply_corporate_action` with the exact-factor rule, `settle_corporate_action`                                     | Real on-chain logic                                            |
| Computed route checks `corporate_action_freeze`, `corporate_action_pending`, `epoch_mismatch`; `next_freeze_ms` in `get_route`                                                                                          | Real on-chain logic, computed from the clock at execution      |
| `approved_multipliers` stored when a relationship is approved; a relationship whose multipliers moved apart is re-proposed and re-approved                                                                              | Real on-chain logic                                            |
| `Lifecycle` side record (kind, flags, stage, append-only history), `set_lifecycle_stage`, `set_lifecycle_flags`, two-step delisting                                                                                     | Real on-chain logic                                            |
| Route checks `not_convertible`, `lifecycle_blocked`, `nav_window_closed`                                                                                                                                                | Real on-chain logic                                            |
| `submit_nav_strike` (`pontis-nav-v1`, ed25519 by a price publisher key); the strike is the fund's reference price in the deviation guard                                                                                | Real verification; the demo producer is simulated and labelled |
| Events for every change (`ActionEvent`, same `pontis` standard); views `get_corporate_actions`, `get_multiplier_epochs`, `get_lifecycle`, `get_nav_strike`, `get_approved_multipliers`; new lines in `get_route_guards` | Real reads                                                     |
| `test-vectors/multiplier-epochs.json` (lookup, exact factor, quotient mismatch, computed in Python with unbounded integers)                                                                                             | Test data                                                      |

## Design notes

- Storage is side maps; `Representation` and `Compatibility` are unchanged (the same call as the guards half). The genesis epoch is written when a representation is registered, so every representation has a schedule.
- `RouteRefusal` and `RejectReason` gain `corporate_action_freeze`, `corporate_action_pending`, `epoch_mismatch`, `not_convertible`, `lifecycle_blocked`, `nav_window_closed` at the end of each enum; no variant moved.
- Check order in `check_route`: status checks, then `not_convertible`, `lifecycle_blocked`, `nav_window_closed`, then freeze, pending, epoch mismatch, then the relationship checks and the price guard.
- `approve_compatibility` derives the required ratio from the multipliers in force now, not the registration ones, and refuses while a freeze or an unapplied action is open on either asset.

## Judgement calls

- Approval is refused at or after `effective_ms`, and `apply_corporate_action` needs `now >= effective_ms`, so every applied epoch is already in force and a freeze always precedes it.
- An action cannot be cancelled once a wrapper has applied it, in addition to the ADR's rule about the effective time.
- Live representations (not `rejected` or `deprecated`) are the ones that must apply; `settle_corporate_action` also closes a multiplier action when every live wrapper has applied, which is how a deprecated wrapper stops blocking.
- An action with no multiplier change records applications but adds no epoch and does not bump versions.
- `propose_compatibility` accepts an `approved` or `suspended` relationship whose multipliers moved apart, as the rebase path; before this it accepted only a `rejected` one.

## Verification

- `scripts/rust-ci.sh fmt`, `clippy` (workspace, `-D warnings`) and `test` pass: 323 `pontis-core` unit and property tests and 35 for the other crates.
- Shared vector: `test-vectors/multiplier-epochs.json` (effective-multiplier lookup, exact-factor rule with overflow refusals, quotient mismatch) is computed with unbounded Python integers and reproduced by Rust (`epochs_tests.rs`). There is no TypeScript mirror.
- Sandbox (`contracts/integration-tests/tests/actions.rs`, real wasm, the clock moved with `fast_forward`): a 2:1 split of a claim with two wrappers closes the pair in the freeze window (`corporate_action_freeze`, conversion refused as `CORPORATE_ACTION_FREEZE`); after the effective time with one wrapper applied the pair stays shut (`corporate_action_pending`); a wrong factor is refused and changes nothing; once both apply the pair routes at the same ratio with a new version and a quote signed before is refused with `COMPATIBILITY_CHANGED`. A NAV fund converts only inside an open strike window and the next strike opens the next one. `no_conversion` and delisted assets are refused (`NOT_CONVERTIBLE`, `LIFECYCLE_BLOCKED`), delisting needs a second account, and an unconfigured asset converts as in the MVP.
- The existing sandbox suite (conversion, failures, gas, guards, pending inventory, smoke; two test threads) still passes. A host panic shows as a wasm trap in the sandbox, so refusal wording is asserted in unit tests.

## Open risks

- **Wrapper cooperation.** One wrapper that never applies keeps its claim's routes closed.
- **One operator can still hold several roles.** The proposer and approver checks are on accounts, not people; role separation is phase 3.
- **Intermediate commits of this branch do not all build.** New modules were added before the commit that wires them in.
- No external audit, no formal verification, no production monitoring.
