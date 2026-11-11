# Phase 1 report: market context, data platform, demo market

**Status: in progress.** This file is updated as each branch lands. Scope comes from [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md); the data decisions are in [ADR 0015](../decisions/0015-market-data-platform.md).

## Branch sequence

Each branch is one pull request. Branches are stacked on the previous one because ADR 0014 and 0015 are not on `main` yet; merge them in this order.

| #   | Branch                          | Delivers                                                                                       | Real, testnet or simulated                 | State       |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------- |
| 0   | `docs/scope-expansion-adr`      | ADR 0014, research stubs, optional Foundry job ([phase 0](phase-0.md))                         | Documentation                              | done        |
| 1   | `docs/market-data-platform-adr` | ADR 0015, this report                                                                          | Documentation                              | done        |
| 2   | `docs/market-context-metrics`   | `docs/market-context.md`, `docs/success-metrics.md`, README "Why Pontis"                       | Documentation, sourced and dated           | done        |
| 3   | `feat/market-data-model`        | Migration, schema, `packages/market-data` (bucketing, candle builder, stats math), tests       | Real logic on real and simulated rows      | done        |
| 4   | `feat/price-feed-simulator`     | `PriceFeed` interface, `SimulatedPriceFeed`, signed attestations, `apps/simulator` backfill    | Simulated, flagged                         | done        |
| 5   | `feat/seed-catalogue`           | Eight synthetic assets, four issuers with different attestation levels, dossiers, `demo:seed`  | Synthetic registry on a sandbox or testnet | in progress |
| 6   | `feat/market-read-api`          | Market, asset, chart, compare, search, issuer and status reads; OpenAPI; fixtures; handoff doc | Real API over real and simulated data      | done        |
| 7   | `feat/protocol-metrics`         | `GET /v1/metrics/protocol`, `GET /v1/admin/metrics`, Prometheus `/metrics`                     | Computed from the database                 | planned     |

## Read performance

`apps/api/scripts/market-load.ts` against a database holding a 90 day simulated backfill (10 assets, 259,200 price points, 77,760 NAV points, 9,809 trades), 100 requests per endpoint, the fake chain, on a development laptop while other builds were running (so these are pessimistic):

| Endpoint                        | p50 ms | p95 ms | max ms |
| ------------------------------- | ------ | ------ | ------ |
| directory, default page         | 13.9   | 37.2   | 94.2   |
| directory, sorted by market cap | 12.6   | 16.9   | 19.6   |
| directory, search               | 7.3    | 9.5    | 10.7   |
| market overview                 | 4.6    | 6.3    | 7.8    |
| market movers                   | 4.9    | 6.5    | 8.2    |
| price chart, 1h x 500           | 15.1   | 32.5   | 41.0   |
| price chart, 1d x 90 days       | 4.3    | 6.1    | 7.1    |
| NAV chart, 4h x 7 days          | 2.4    | 3.2    | 4.4    |
| supply chart                    | 4.1    | 6.2    | 10.9   |
| asset activity                  | 3.4    | 4.5    | 5.5    |
| search                          | 4.8    | 6.4    | 7.5    |
| status                          | 70.2   | 91.0   | 136.8  |

The brief's target is p95 under 200 ms: met. `EXPLAIN` of the price chart query uses the candles primary key (`representation_id, interval, bucket_start, simulated`) with a bitmap index scan. The search query shows a sequential scan because the table has ten rows; the trigram index exists but the planner does not use it at this size. `GET /v1/status` is the slowest read because it takes the newest `price_points` row per data class; an index on `(simulated, ts)` would fix that if it ever matters.

## Open risks

- The registry sync replaces the mirror from the chain, so market tables hold no foreign keys to it (ADR 0015 section 3). A representation that disappears from the chain leaves orphan market rows; the stats job ignores them.
- Realtime streams (SSE) and watchlists are part of the brief's Workstream J but depend on data from later phases. They are scheduled when that data exists and are not part of this phase's definition of done.
