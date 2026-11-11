# Market simulator

Opt-in process that gives the demo a market: prices, NAV, circulating supply and conversion flow for synthetic assets. **Everything it writes is fiction and is flagged** `simulated: true`, `source: "simulated_feed"` ([ADR 0015](../../docs/decisions/0015-market-data-platform.md)). It never touches the chain.

## What it writes

| Table                                           | Content                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `price_points`                                  | One point per representation every five minutes, each with an ed25519 price attestation from the dev price-publisher key                                                                                                                                                                          |
| `nav_points`                                    | NAV per token for fund and note claims (`syn-ustb`, `syn-credit`, the bill, money-market and note claims below)                                                                                                                                                                                   |
| `supply_snapshots`                              | One snapshot per representation per UTC day                                                                                                                                                                                                                                                       |
| `trades`                                        | Parity conversions between the wrappers of one claim, priced with the contract's rounding and a 10 bps fee. A claim with a single wrapper (a unique asset such as `syn-villa`, `syn-art-canvas`, `syn-resi-flat`, or any claim registered once) gets prices, supply and candles but **no trades** |
| `candles`, `asset_market_stats`, `asset_search` | Rebuilt from the rows above by the market jobs                                                                                                                                                                                                                                                    |

Only representations whose canonical asset has a profile in `@pontis/market-data` (`SIMULATED_CLAIMS`: the seven in `DEFAULT_CLAIMS` plus the 27 in `RICH_CLAIMS`) are simulated; the rest are listed as `skipped`. It reads the registry mirror, so run the API (or its sync) against a chain with the catalogue registered first.

## Profiles per claim

| What                | Where                                                                                | Notes                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price / NAV / jumps | `packages/market-data/src/feed/profiles.ts`, `profiles-rich.ts`                      | `DEFAULT_CLAIMS` is frozen (same seed, same series); `RICH_CLAIMS` adds bills, money markets, notes, funds, real estate, art, metals, energy, carbon, stocks, FX. Merged as `SIMULATED_CLAIMS`  |
| Supply at the start | `src/supply.ts` (original claims), `src/supply-rich.ts` (`RICH_START_SUPPLY_TOKENS`) | Whole tokens, merged into one `START_SUPPLY_TOKENS`. A unique asset is exactly 1 and never grows                                                                                                |
| Supply growth       | `src/supply-rich.ts` (`RICH_DAILY_GROWTH_PPM`)                                       | ppm of the start per day; 2,000 unless listed. Negative shrinks (delisted stock, retired carbon credits) and stops at zero                                                                      |
| Trades per hour     | `src/supply-rich.ts` (`FLOW_MAX_PER_HOUR`)                                           | The hourly draw is below this number; 4 unless listed. Money markets, bills and FX 7; index and equity 5; bond fund, metals, oil, copper and carbon 4; notes 3; private funds and real estate 2 |

A claim's trades are drawn per hour from a seed of the claim and the hour, so reruns insert nothing new.

## Run

```bash
cp apps/simulator/.env.example apps/simulator/.env     # DATABASE_URL, PONTIS_CORE_ACCOUNT_ID, SIM_BACKFILL_DAYS, SIM_TICK_MS
pnpm --filter @pontis/simulator start backfill          # SIM_BACKFILL_DAYS of history (default 90), safe to repeat
pnpm --filter @pontis/simulator start run               # continue from the newest point every SIM_TICK_MS
```

Both commands are idempotent: a repeated window inserts nothing new. The series are deterministic, so the same time always has the same price on every machine.

## Backfill time

A 90-day backfill of the whole `full` catalogue (53 representations, 1.37 million price points, 337,000 NAV points, 80,000 trades, 789,000 candles) took 171 s on an 8-core machine at a load average of 2 to 5; the `demo` tier (26 representations) took 57 s. Under heavy load from other work on the same machine it took 4 to 7 minutes. Signing runs on the libuv threadpool, representations are written concurrently and prices, NAV and candles are inserted as one JSON parameter per batch; `SIM_BACKFILL_DAYS` scales the time linearly. A repeated backfill re-signs every point before skipping the duplicates, so it costs most of the first run. Details: [phase 3 seed report](../../docs/progress/phase-3-seed.md).

## How honest it is

- **Integer math only.** A seeded integer PRNG and integer random-walk steps; prices are bigint at 8 decimals.
- **Signed, not trusted.** The attestations use a key derived from a public label (`@pontis/dev-keys`). They exercise the oracle path; they prove nothing about any price. `submit_price` verifies them on chain (ADR 0016); each is signed for one core account (`PONTIS_CORE_ACCOUNT_ID`), so a price cannot be replayed on another deployment. Rows written before this format (`pontis-price-v1`) no longer verify: reset the simulated rows and backfill again.
- **Candles.** One-minute and five-minute candles are built for the last two days only; most of those buckets are `filled` because the feed has one point per five minutes.
- **Not a model of any real market.** Volatility, drift, NAV accrual and corporate-action jumps are demo numbers in `packages/market-data/src/feed/profiles.ts` and `profiles-rich.ts`.
