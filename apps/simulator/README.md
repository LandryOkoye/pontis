# Market simulator

Opt-in process that gives the demo a market: prices, NAV, circulating supply and conversion flow for synthetic assets. **Everything it writes is fiction and is flagged** `simulated: true`, `source: "simulated_feed"` ([ADR 0015](../../docs/decisions/0015-market-data-platform.md)). It never touches the chain.

## What it writes

| Table                                           | Content                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `price_points`                                  | One point per representation every five minutes, each with an ed25519 price attestation from the dev price-publisher key |
| `nav_points`                                    | NAV per token for fund-style claims (`syn-ustb`, `syn-credit`)                                                           |
| `supply_snapshots`                              | One snapshot per representation per UTC day                                                                              |
| `trades`                                        | Parity conversions between the wrappers of one claim, priced with the contract's rounding and a 10 bps fee               |
| `candles`, `asset_market_stats`, `asset_search` | Rebuilt from the rows above by the market jobs                                                                           |

Only representations whose canonical asset has a profile in `@pontis/market-data` (`DEFAULT_CLAIMS`) are simulated; the rest are listed as `skipped`. It reads the registry mirror, so run the API (or its sync) against a chain with the catalogue registered first.

## Run

```bash
cp apps/simulator/.env.example apps/simulator/.env     # DATABASE_URL, PONTIS_CORE_ACCOUNT_ID, SIM_BACKFILL_DAYS, SIM_TICK_MS
pnpm --filter @pontis/simulator start backfill          # SIM_BACKFILL_DAYS of history (default 90), safe to repeat
pnpm --filter @pontis/simulator start run               # continue from the newest point every SIM_TICK_MS
```

Both commands are idempotent: a repeated window inserts nothing new. The series are deterministic, so the same time always has the same price on every machine.

## How honest it is

- **Integer math only.** A seeded integer PRNG and integer random-walk steps; prices are bigint at 8 decimals.
- **Signed, not trusted.** The attestations use a key derived from a public label (`@pontis/dev-keys`). They exercise the oracle path; they prove nothing about any price. `submit_price` verifies them on chain (ADR 0016); each is signed for one core account (`PONTIS_CORE_ACCOUNT_ID`), so a price cannot be replayed on another deployment. Rows written before this format (`pontis-price-v1`) no longer verify: reset the simulated rows and backfill again.
- **Candles.** One-minute and five-minute candles are built for the last two days only; most of those buckets are `filled` because the feed has one point per five minutes.
- **Not a model of any real market.** Volatility, drift, NAV accrual and corporate-action jumps are demo numbers in `packages/market-data/src/feed/profiles.ts`.
