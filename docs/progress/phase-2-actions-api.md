# Phase 2: corporate actions, lifecycle and NAV strikes in the API, scripts and indexer

The mirror of [phase 2 actions](phase-2-actions.md) outside the contract. Branch `feat/actions-api`, on `feat/core-actions-lifecycle`. The web app is untouched.

## What changed

| Area        | Change                                                                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain      | Six refusal codes (`CORPORATE_ACTION_FREEZE`, `CORPORATE_ACTION_PENDING`, `EPOCH_MISMATCH`, `NOT_CONVERTIBLE`, `LIFECYCLE_BLOCKED`, `NAV_WINDOW_CLOSED`), review actions `multiplier_epoch` and `lifecycle_flags`, the reconciliation kind `CORPORATE_ACTION_OVERDUE`, and the action, asset kind and lifecycle stage enums. |
| near-client | `getCorporateActions`, `getMultiplierEpochs`, `getLifecycle`, `getNavStrike`; the six refusals in the strict `ROUTE_REFUSALS`; `next_freeze_ms` (required, nullable) on the route view.                                                                                                                                      |
| api-types   | `GET /v1/assets/{id}/lifecycle`, `/corporate-actions`, `/nav`, their schemas and fixtures; the new codes on `POST /v1/quotes`; `openapi.yaml` regenerated.                                                                                                                                                                   |
| API         | The three endpoints read the chain live (the mirror only supplies the asset, its claim and its wrappers); every new refusal and guard breakdown line maps to a code with a plain-language message; a quote's `expiresAt` is clamped to `next_freeze_ms`.                                                                     |
| market-data | `navStrikeMessage` and `submitNavStrikeArgs` sign the `pontis-nav-v1` layout, pinned by `test-vectors/nav-strike.json`.                                                                                                                                                                                                      |
| scripts     | `actions propose \| add-evidence \| approve \| cancel \| apply \| settle \| set-stage \| set-flags \| request-delist \| approve-delist \| nav`; [runbook](../runbooks/corporate-actions.md).                                                                                                                                 |
| indexer     | Finding `CORPORATE_ACTION_OVERDUE` (warning): an approved action with a multiplier change, effective more than 10 minutes ago, that a live wrapper has not applied. One finding per action. [ADR 0012](../decisions/0012-reconciliation.md).                                                                                 |

## Decisions

- Facts about actions and strikes are passed through with the labels the chain stores: evidence `provenance`, and `simulated` and `source` on a NAV strike. Nothing is marked verified, and the API computes only what the contract computes from the clock (the freeze window and the NAV window), with the same boundaries.
- `next_freeze_ms` is required in the route view schema, not optional: the contract always sends it, and a client that drifts from the contract should fail loudly like it does for an unknown refusal.
- The NAV label of the operator command is `simulated_feed`, as for prices; `simulated_nav` is not a valid data source.
- The wrapper set of an action comes from the synced registry, so it can lag the chain by one sync.
- The contract's `get_approved_multipliers` is not read: nothing in the API or indexer needs it yet.

## Verification

`tsc --noEmit` and `eslint` are clean in domain, near-client, api-types, market-data, scripts, `apps/api` and `apps/indexer`; vitest passes in each, run alone (domain 56, near-client 65, api-types 75, market-data 40, scripts 69, `apps/api` 219, `apps/indexer` 77 tests). The sandbox end-to-end scenarios (`tests/e2e`) and the Rust suite were not run by this work, and no `actions` command was run against a chain.

## Not done

- No Rust test reads `test-vectors/nav-strike.json`; the layout was checked against `nav.rs` by reading. Pinning it from Rust needs a test in `nav_tests.rs`.
- Actions and strikes are not mirrored into tables, and no event of the action family is interpreted by the indexer beyond storing it generically.
