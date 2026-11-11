# ADR 0015: Market data platform

- **Status:** Accepted
- **Date:** 2026-11-11
- **Brief items:** expansion brief §12.2, §12.3, §12.5 and §16 (Workstream J)
- **Related:** [0014](0014-scope-expansion-beyond-mvp.md), [0001](0001-synthetic-claim-and-units.md), [0009](0009-synthetic-evidence-labelling.md), [0011](0011-indexer.md)

## Context

The MVP API serves registry records, quotes and conversion history. A product UI also needs prices, charts, supply, volume and a searchable directory. Synthetic assets on a testnet have no market, and real RWA prices are not available to Pontis. The platform therefore needs three things at once: tables that hold market data, a way to generate a clearly fake market for the demo, and rules that make it impossible to show the fake data as real.

## Decision

### 1. Sources and the honesty rule

Every market row carries `source` (text) and `simulated` (boolean). The known sources:

| `source`                             | `simulated` | Meaning                                                                                      |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------- |
| `pontis_trades`                      | false       | Real conversions settled on the testnet and indexed from `pontis-core` events                |
| `simulated_feed`                     | true        | The seeded `SimulatedPriceFeed` (decision 5). Also covers simulator-generated trades and NAV |
| (future) `intents`, other real feeds | false       | Added only after research per [0014](0014-scope-expansion-beyond-mvp.md) section 3           |

Rules:

- No table mixes the two in one aggregate row. Candles and stats are computed per `simulated` value.
- Every chart response is `{ points, interval, from, to, source, simulated, filled_points }`. `simulated` is true when any point is simulated, and each point also carries its own flag, so a UI can never present a simulated point as real.
- A read takes `data=real|simulated|all` (default `all`). `all` uses a real point for a bucket when one exists and a simulated one otherwise.
- Directory and asset responses carry the same pair for the price and every figure derived from it (market cap, change, volume).

### 2. Numbers

Prices are decimal strings in a quote currency (`USD` for simulated data) stored as `numeric(38, 8)`. Arithmetic on them in TypeScript is `bigint` fixed point at 8 decimals. Percent changes are integer basis points. There is no floating point on any value that is shown or stored. This includes the simulator: it draws from an integer PRNG and uses integer approximations (decision 5).

### 3. Tables (migration in the feature PR)

Keys are plain text IDs without foreign keys to the registry mirror, because the registry sync replaces the mirror from the chain ([sync](../../apps/api/src/sync/registry-sync.ts)) and must not be blocked by market rows.

| Table                                                                                                                                               | Holds                                                                                                                                                             | Added in                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `asset_profiles`                                                                                                                                    | Off-chain dossier per canonical asset or representation: tags, description, documents, chains, custody text, `source`, `simulated`. Never marks anything verified | phase 1                                   |
| `price_points`                                                                                                                                      | Raw price observations `(representation_id, ts, price, currency, source, simulated, attestation)`                                                                 | phase 1                                   |
| `candles`                                                                                                                                           | OHLCV per `(representation_id, interval, bucket_start, simulated)`: open, high, low, close, `volume_base`, `volume_quote`, `trades`, `filled`                     | phase 1                                   |
| `nav_points`                                                                                                                                        | NAV per unit per fund-style representation                                                                                                                        | phase 1                                   |
| `supply_snapshots`                                                                                                                                  | Circulating supply per representation per chain                                                                                                                   | phase 1                                   |
| `trades`                                                                                                                                            | Settled conversions normalised from `settlement_events` (and later pool and bridge events), `source` `pontis_trades`                                              | phase 1                                   |
| `asset_market_stats`                                                                                                                                | Denormalised latest price, 24h, 7d and 30d change, market cap, volume, supply, rank, per `simulated` value                                                        | phase 1                                   |
| `asset_search`                                                                                                                                      | `tsvector` plus trigram index over name, symbol, issuer, category and tags                                                                                        | phase 1                                   |
| `tvl_snapshots`, `pool_snapshots`, `reserve_points`, `parity_deviation_points`, `holder_snapshots`, `watchlists`, `alert_rules`, `alert_deliveries` | Their data does not exist yet                                                                                                                                     | the phase that creates the data (2, 4, 5) |

No TimescaleDB. Candle reads use the primary key `(representation_id, interval, bucket_start, simulated)`; at the demo's size (about ten assets, six intervals, 90 days) partitioning is not needed. `EXPLAIN` evidence for the main queries goes in the performance PR.

### 4. Candles and stats

- Intervals: 1m, 5m, 15m, 1h, 4h, 1d, aligned to UTC.
- OHLC come from `price_points`. Volume comes from `trades` in the bucket (base amount in the representation's units, quote volume at the price of the bucket). A parity conversion has no market price of its own, so it contributes volume only.
- The candle builder is an idempotent upsert per bucket and can rebuild any range. A bucket with no price point repeats the previous close with `filled = true` and zero volume. Leading buckets before the first point do not exist.
- The builder and the stats refresh run in the indexer process on a timer, like the reconciler. The simulator only writes price points and trades.
- Definitions: market cap = circulating supply times the reference price. 24h, 7d and 30d change are from candle closes. TVL in phase 1 is vault inventory times the price (the only real liquidity that exists). Holders and APY are defined when their data exists (phases 5 and later) and are `null` until then, not zero.

### 5. Reference prices and the simulator

- `PriceFeed` is an interface (`latest`, `history(from, to)`, each point `{representation_id, price, currency, as_of_ms, source, simulated}`). `SimulatedPriceFeed` is the first implementation: seeded, deterministic, per-asset profiles (drift, volatility, jump events for corporate actions, slow accrual for fund NAV), integer arithmetic only.
- It also produces **signed price attestations** (ed25519 over a domain-separated payload, signer from the dev keystore). Phase 1 stores and serves them. On-chain verification arrives with the price guard in phase 2 under its own ADR.
- `apps/simulator` is opt-in. It backfills a historical window (90 days by default) and then streams new points. Everything it writes is `simulated: true`. A real feed implementation is added only after the research gate.

### 6. API conventions for the new reads

- Version `/v1`, additive changes, cursor pagination (opaque cursor holding the sort key and ID), `ETag` and `Cache-Control` on public reads.
- Zod schemas in `packages/api-types` generate the OpenAPI document. Every endpoint has a fixture, and `API_MODE=fixtures` serves them without a chain or database.
- Refusals use stable codes with an explanation and a hint.

## Consequences

- The registry mirror stays a pure chain cache. Everything the chain does not hold lives in `asset_profiles`, labelled by source.
- A simulated market will look alive in the UI. The only protection is the flag, so tests assert that every serializer fills `simulated` and `source`, and the handoff document tells the frontend to render them.
- Candle volume for parity conversions is a count of units moved, not a market measure. The handoff document says so.
- Later phases add their tables and extend the stats without changing these.
