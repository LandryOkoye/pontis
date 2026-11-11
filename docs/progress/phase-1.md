# Phase 1 report: market context, data platform, demo market

**Status: in progress.** This file is updated as each branch lands. Scope comes from [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md); the data decisions are in [ADR 0015](../decisions/0015-market-data-platform.md).

## Branch sequence

Each branch is one pull request. Branches are stacked on the previous one because ADR 0014 and 0015 are not on `main` yet; merge them in this order.

| #   | Branch                          | Delivers                                                                                       | Real, testnet or simulated                 | State   |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ | ------- |
| 0   | `docs/scope-expansion-adr`      | ADR 0014, research stubs, optional Foundry job ([phase 0](phase-0.md))                         | Documentation                              | done    |
| 1   | `docs/market-data-platform-adr` | ADR 0015, this report                                                                          | Documentation                              | done    |
| 2   | `docs/market-context-metrics`   | `docs/market-context.md`, `docs/success-metrics.md`, README "Why Pontis"                       | Documentation, sourced and dated           | planned |
| 3   | `feat/market-data-model`        | Migration, schema, `packages/market-data` (bucketing, candle builder, stats math), tests       | Real logic on real and simulated rows      | planned |
| 4   | `feat/price-feed-simulator`     | `PriceFeed` interface, `SimulatedPriceFeed`, signed attestations, `apps/simulator` backfill    | Simulated, flagged                         | planned |
| 5   | `feat/seed-catalogue`           | Eight synthetic assets, four issuers with different attestation levels, dossiers, `demo:seed`  | Synthetic registry on a sandbox or testnet | planned |
| 6   | `feat/market-read-api`          | Market, asset, chart, compare, search, issuer and status reads; OpenAPI; fixtures; handoff doc | Real API over real and simulated data      | planned |
| 7   | `feat/protocol-metrics`         | `GET /v1/metrics/protocol`, `GET /v1/admin/metrics`, Prometheus `/metrics`                     | Computed from the database                 | planned |

## Open risks

- The registry sync replaces the mirror from the chain, so market tables hold no foreign keys to it (ADR 0015 section 3). A representation that disappears from the chain leaves orphan market rows; the stats job ignores them.
- Realtime streams (SSE) and watchlists are part of the brief's Workstream J but depend on data from later phases. They are scheduled when that data exists and are not part of this phase's definition of done.
