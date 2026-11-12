# Phase 4: custody, reserves and redemption in the public API

The TypeScript side of the public reads of [ADR 0020](../decisions/0020-custody-reserves-and-redemption.md) section 10. Branch `feat/phase4-api`, on `docs/phase4-adr`. The web app, the indexer and `packages/db` are untouched; the contract is written elsewhere and none of this was run against it.

## What changed

| Area        | Change                                                                                                                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| domain      | `RESERVE_RESTRICTED`, `RESERVE_STALE` (refusals), `REDEMPTION_*` and `ATTESTATION_REJECTED` (error codes); enums for custody structure, custodian status, reserve state, policy action, redemption status and miss, mint request status; integer helpers for the redemption window, the fee (rounded up) and basis points.                 |
| near-client | Strict schemas and `CoreClient` views for custodians, the custody link, reserve attestations, history and status, supply, mint headroom and requests, redemption terms, redemptions (by user, by asset), the escrow ledger and issuer reliability; `reserve_restricted` and `reserve_stale` in `ROUTE_REFUSALS`; fixtures.                 |
| api-types   | Nine `GET` endpoints and `POST /v1/reserves/attestations`, their schemas (every response has `simulated`, `sources`, `notice`), fixtures, `openapi.yaml`.                                                                                                                                                                                  |
| API         | `src/custody`: a `CustodyRepository` interface that `CoreClient` implements from the chain views, the services, newest-first paging over the contract's oldest-first pages, and the relay with a near-api-js relayer. `reasons.ts` maps the two refusals and the `reserves` guard line. Fixtures mode serves the reads and 404s the relay. |
| docs        | Handoff, known limitations, deliberately mocked, threat model T60 to T63, [runbook](../runbooks/reserve-relay.md).                                                                                                                                                                                                                         |

## Decisions

- **Reads are live, behind one interface.** The indexer's mirror tables did not exist when this was written and `packages/db` is not this work's, so the services read a `CustodyRepository`. The history-shaped reads (reserve history, redemption timeline) can be moved onto the tables later without touching the services.
- **The reserve policy comes from `get_reserve_status`.** The ADR names no policy view; the status carries `action`, `tolerance_bps` and `max_reserve_age_ms`, so the policy needs no view. `baseline_supply` is not shown.
- **Labels are never upgraded.** Attestation `simulated` and `source` pass through as signed. Where the API supplies a label of its own it is `simulated: true` (custodian and terms records `registrar_entry`; redemptions and reliability `simulated_issuer`), and an unmonitored asset or one with no attestation stays `simulated: true` with empty `sources`.
- **Refusals are `422`, like every other quote refusal.** The ADR writes 409 for `RESERVE_*`; the quote endpoint refuses every reason with 422 and clients branch on `code`, so the new ones follow it.
- **The relay does not verify the signature.** It forwards and reports the contract's verdict (`ATTESTATION_REJECTED`, 422). The relayer is `PONTIS_RELAYER_ACCOUNT_ID` and `PONTIS_RELAYER_SECRET_KEY`, both or neither; the repository had no price relayer in the API (the demo one is `scripts guards publish`), so this is the first.
- **Redemption listings need `user` or `representationId`** because the chain lists by account or by asset. The timeline is rebuilt from the record, and `resolved_ms` is read as the time of the latest transition.

## Verification

`tsc --noEmit` and `eslint` are clean in `packages/domain`, `packages/near-client`, `packages/api-types` and `apps/api`; vitest passes in each (domain 62, near-client 80, api-types 101, `apps/api` 319 tests, run alone against Postgres on port 5439); `prettier --check .` is clean. No contract, sandbox end-to-end or testnet run was done.

## Not done

- The session endpoints (redemption prepare, reclaim intent, issuer queue and mint requests): they wait for the NEP-413 session.
- `txHash` on the redemption timeline and any history beyond the chain's 500 attestations need the indexer's mirror tables.
- No Rust test pins the camelCase to snake_case mapping of the relay body; it is tested against the ADR's shape. When the contract exists, check the view names and JSON in `packages/near-client/src/core.ts` against it.
