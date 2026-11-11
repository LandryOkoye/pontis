# Frontend handoff

What the API serves for each screen, how to read it, and what is not there yet. Kept in step with `packages/api-types` (schemas, `openapi.yaml`, fixtures). If a screen needs something that is not listed here, ask for it; do not infer it.

- **Contract:** `packages/api-types` (`ENDPOINTS`, Zod schemas, `openapi.yaml`). Example payloads for every endpoint: `import * as fx from "@pontis/api-types/fixtures"`.
- **No chain needed:** run the API with `API_MODE=fixtures` ([API README](../../apps/api/README.md), `apps/api/.env.example`). It serves the same fixtures, validates requests like the real server, marks every response `x-pontis-mode: fixtures`, and answers 404 for what needs a live chain (`compareRoutes`, `createConversion`, `markConversionSubmitted`, admin, Prometheus `/metrics`); `getRouteGuards` is served from a fixture.
- **Base URL:** `http://localhost:3000`; all paths are under `/v1`.

## Conventions

| Topic          | Rule                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token amounts  | Decimal strings of smallest units (`AmountString`). Never numbers.                                                                                      |
| Prices, caps   | `PriceString`: decimal string, up to 8 places, in `currency` (`USD` for simulated data). Never numbers.                                                 |
| Changes        | Integer basis points (`change24hBps: 31` is +0.31%). `null` means "not computable", not zero.                                                           |
| Times          | ISO-8601 UTC strings.                                                                                                                                   |
| Fields         | camelCase.                                                                                                                                              |
| Paging         | `limit` and an opaque `cursor`; the response has `nextCursor` (null on the last page). A cursor only works with the query it came from (400 otherwise). |
| Caching        | Public market reads send `ETag` and `Cache-Control: public, max-age=5`. Send `If-None-Match` for a `304`. Protocol metrics use `max-age=30`.            |
| Errors         | `{code, message, details?}` with a stable `code` (`VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, ...). Branch on `code`, show `message`.              |
| Wallet actions | The API never holds a user key. Write endpoints return the exact unsigned actions for the wallet to sign (see conversions in the OpenAPI document).     |

### Real versus simulated: render it

Almost all market data today is **simulated** by `apps/simulator`. The contract makes that impossible to miss, and the UI must show it.

- Every market figure carries `simulated: boolean` (and `sources`, `source`) at the level it applies to: a `MarketSnapshot`, a `Sparkline`, each chart envelope **and each chart point**, each activity row, each breakdown.
- `data=real|simulated|all` on market reads picks the class. `all` prefers real data and falls back to simulated; a row never blends the two. A real figure can be null while the simulated one exists (`data=real` shows what is real).
- Show a visible "simulated" badge wherever `simulated` is true, and do not format a simulated number as a price quote or a market statistic without it.
- Dossier text (`profile`) has `source` and `simulated` too. It never changes a verification status; use `verificationStatus` from the registry for trust badges.

```jsonc
// MarketSnapshot (one row of GET /v1/assets)
{
  "price": "2681.42585338",
  "currency": "USD",
  "priceAsOf": "2026-11-11T12:00:00.000Z",
  "change24hBps": 31,
  "change7dBps": 396,
  "change30dBps": -5,
  "supply": "12400000000",
  "marketCap": "33250000.5",
  "volume24h": "1250000.25",
  "tvl": "4100000",
  "rank": 1,
  "sources": ["simulated_feed"],
  "simulated": true,
}
```

## Screens

| #   | Screen                | Endpoints                                                                                                                                               | Notes                                                                                                                                                                                                                                        |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Market overview       | `GET /market/overview`, `/market/movers`, `/market/categories`, `/market/chains`, `/issuers/leaderboard`                                                | Totals include only assets that have the figure; `totalMarketCap: null` means no asset has a known supply. `change24hBps` is market-cap weighted. No "trending" list exists.                                                                 |
| 2   | Asset directory       | `GET /assets` (`q`, `category`, `issuerId`, `chain`, `verification`, `status`, `convertible`, `bridgeable`, `sort`, `order`, `limit`, `cursor`, `data`) | Rows carry `market` and a 7 day `sparkline` (both null without a price). Sorting by a figure puts nulls last. `convertible` means an approved parity route exists.                                                                           |
| 3   | Asset detail          | `GET /assets/{id}`, `/metadata`, `/issuer`, `/chains`, `/documents`, `/compatibility`, `/activity`, `/charts/{price,nav,supply,volume}`                 | Tabs without data return empty lists or a null `profile`, not errors. Reserves, lifecycle and corporate actions are not served yet (see below).                                                                                              |
| 4   | Compare               | `GET /compare?ids=a,b,c`                                                                                                                                | `pairs` gives parity ratio (from the registry), implied market ratio and deviation. The implied ratio is `null` when one price is real and the other simulated.                                                                              |
| 5   | Trade                 | `POST /routes/compare`, `POST /quotes`, `GET /quotes/{id}`, `POST /conversions`, `POST /conversions/{id}/submitted`, `GET /transactions`                | Parity conversion only. No price impact, slippage, depth or multi-source quotes yet. A guarded pair can refuse with `PRICE_*` or `AMOUNT_*` codes: show `message`, and fetch `GET /routes/{from}/{to}/guards?amount=` for the failing check. |
| 6   | Portfolio             | `GET /transactions?account=`                                                                                                                            | History only. No balances, positions, PnL or LP views yet.                                                                                                                                                                                   |
| 7   | Issuers               | `GET /issuers`, `/issuers/{id}`, `/issuers/leaderboard`, `GET /assets/{id}/issuer`                                                                      | `reliabilityScore` is `null` until redemption and reserve data exist. Evidence keeps its `provenance`; nothing is third-party verified yet.                                                                                                  |
| 8   | Watchlists and alerts | not served                                                                                                                                              | Needs accounts and a delivery channel.                                                                                                                                                                                                       |
| 9   | Status                | `GET /status`, `GET /health`                                                                                                                            | `prices.real` and `prices.simulated` are reported apart. `reserves` and `bridge` are `null` until they exist. `incidents` is empty.                                                                                                          |

## Charts

`GET /assets/{id}/charts/{price,nav,supply,volume}?interval=1m|5m|15m|1h|4h|1d&from=&to=&data=` returns `{representationId, interval, from, to, points, source, simulated, filledPoints}`.

- `to` defaults to now and `from` to 500 buckets before it. More than 5000 buckets is a 400.
- **`filled: true`** marks a bucket with no observation of its own; its value is carried forward. Draw it dashed or dimmed, and use `filledPoints` to judge how sparse a series is. One-minute and five-minute candles exist only for the last two days and are mostly filled.
- **Volume is units moved**, valued at the bucket's close. A parity conversion has no market price of its own, so this is not a market-volume measure. Real conversions only appear in a candle when a real price exists for the bucket, which is not the case yet.
- NAV and supply: the last value before the end of each bucket. An asset without a NAV has empty NAV `points`.

## Protocol metrics

`GET /v1/metrics/protocol` (public, `Cache-Control: public, max-age=30`, ETag) lists metrics with `key`, `unit`, `scope`, `available`, and either `values` per window (`24h`, `7d`, `all`) or one `value`. The keys are the snake_case names of the success-metrics spec.

- **Null is "no data"**: a rate with no denominator, a latency with no settled conversion, `indexer_lag_blocks` when the RPC is down. Do not render it as 0.
- Counts are integers; rates (`unit: ratio`) are decimal strings from 0 to 1 and `assets_third_party_attested_pct` (`unit: percent`) from 0 to 100, both at 6 places; latencies are decimal strings of seconds at 3 places. Never convert through floats for anything but display.
- `available: false` metrics (USD values, pools, bridge, reserves, parity, breaker) carry `availableFrom` (the phase). Show them as "coming", not as 0.
- `simulated` is true when the metric reads synthetic rows, which is every row of the testnet deployment. Show the badge. Metrics are computed from the database; they do not change what is real or simulated elsewhere.
- Public aggregates only: per-representation amounts and quote IDs are in the admin view (`GET /v1/admin/metrics`) and Prometheus (`GET /metrics`), both behind the admin key; the frontend does not call them.
- The public response lists only the keys the spec tags for the public endpoint; the admin-only keys (for example `requires_reconciliation_open`, `submit_to_settle_latency_seconds_p95`, `indexer_heartbeat_age_seconds`) are not in it.
- Windows are rolling from `asOf` (not calendar days); `all` has no lower bound. Poll no faster than the cache lifetime.
- Fixtures mode serves the public endpoint; the two admin-keyed ones answer 404 there.

## Not available yet

These are in the brief and not in the API. They arrive with the phase named, and this document changes with them.

| Feature                                                                             | Phase   |
| ----------------------------------------------------------------------------------- | ------- |
| Corporate actions and lifecycle                                                     | 2, next |
| Issuer onboarding, attestations, account sign-in, issuer portal                     | 3       |
| Reserves, custody, redemption, holders                                              | 4       |
| Pools, LPs, market-priced quotes, depth, trade and portfolio endpoints, SSE streams | 5       |
| Bridge routes and transfers, `chains` supply across real chains                     | 6       |
| Private RFQ                                                                         | 8       |

## Changes to existing endpoints

- **`GET /v1/assets`** (additive, but the response shape grew): `items[]` gained `category`, `tags`, `chains`, `convertible`, `bridgeable`, `market`, `sparkline`; the body gained `nextCursor` and `total`; it accepts the query parameters above. The default order is still by `id`. Existing readers of `items[].id`, `symbol`, `name`, `issuer`, ... are unaffected.

- **`POST /v1/quotes` and `POST /v1/routes/compare`** (additive): new refusal `code` values `PRICE_DEVIATION`, `PRICE_STALE`, `PRICE_UNAVAILABLE`, `AMOUNT_BELOW_MIN`, `AMOUNT_ABOVE_MAX`, `WINDOW_LIMIT_EXCEEDED` on a pair that has a route guard. A pair without a guard behaves as before. An open circuit breaker is `RELATIONSHIP_SUSPENDED`. `feeBps` of a quote can now exceed the base fee on a guarded pair: it includes a skew that rises as the destination vault drains, and is the fee the contract will charge.
- **`GET /v1/routes/{fromId}/{toId}/guards?amount=`** (new): every guard check with its verdict and, for an amount, the effective `feeBps` and `skewBps`. `prices[]` are the reference prices the contract holds, each with `ageMs`, `source` and `simulated`. **Render the `simulated` flag**: the demo publishes simulated prices only, so a "market price agrees" message is a statement about the simulator.
- **Compatibility `history[].action`** gained `guard_set`: a guard was set or changed (the ratio and status did not).
