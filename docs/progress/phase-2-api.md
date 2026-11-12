# Phase 2: guards in the API, scripts and end-to-end run

The mirror of [phase 2 guards](phase-2-guards.md) outside the contract. Branch `feat/guards-api-indexer`, on `feat/price-attestation-v2` (market data) and `feat/core-price-guards` (contract).

## What changed

| Area        | Change                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| market-data | Price attestations use the on-chain layout `pontis-price-v2` (Borsh, bound to the core account), pinned by `test-vectors/price-attestation.json` with the contract. `submitPriceArgs` is the exact `submit_price` input. |
| simulator   | Needs `PONTIS_CORE_ACCOUNT_ID` and signs each price for it. Older `pontis-price-v1` rows no longer verify: reset the simulated rows and backfill.                                                                        |
| near-client | `getRouteGuards`, `getPrice`; the four price refusals.                                                                                                                                                                   |
| domain, API | Six refusal codes, review action `guard_set`; quotes and route comparison use the contract's guard verdict and copy its fee (skew included); `GET /v1/routes/{from}/{to}/guards`.                                        |
| scripts     | `guards register-publisher \| set-guard \| publish [--loop] \| status`; the demo guard preset; [runbook](../runbooks/price-guards.md).                                                                                   |
| e2e         | A sandbox scenario: no price closes a guarded pair, fresh prices open it, a conversion settles at the quoted fee, a 3 percent move refuses with `PRICE_DEVIATION`, recovery reopens.                                     |
| Indexer     | No change needed: every core event, including the guard events, is already stored generically in `settlement_events`. Derived tables for guards are not built.                                                           |

## Decisions

- The API does not reimplement the skew. It asks the contract (`get_route_guards` with the amount) and quotes that fee, so a quote cannot disagree with execution. `packages/quote-engine/src/guard.ts` mirrors the arithmetic and is tested against the same vectors, for clients that must predict a fee offline.
- The relayer signs the price in force now as of now; the contract needs a strictly newer, fresh price and the feed steps every five minutes. Labelled in the limitations.
- Guard events are not mirrored into tables: nothing reads them yet, and the contract views are authoritative.

## Verification

- Full end-to-end run on a local sandbox with the slim wasm: all steps passed in 416 s, including the new price guard scenario (unpriced guarded pair refused as `PRICE_UNAVAILABLE`; fresh prices open it; a conversion settles at the quoted fee; a 3 percent move gives `PRICE_DEVIATION`; recovery reopens).
- API quote, compare, guards-endpoint and fixtures tests; near-client, api-types, scripts, market-data and simulator tests; typecheck and lint on every touched package.
- Not re-run after the final commit: the whole `apps/api` suite in one go (the touched quote tests were run together and pass).
