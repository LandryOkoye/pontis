# Phase 3: a rich mock catalogue, three tiers and a one-command loader

[ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md) section 3: the demo catalogue grows from 4 issuers and 8 tokens into a market that looks populated. Branch `feat/seed-rich-catalogue`, on main at phase 2 complete. No Rust, no web app, no auth work, no reserves or redemption data (phase 4 attaches those by id; see `PHASE_4_EXTENSION_POINT` in `scripts/lib/catalogue-tiers.ts`). **Everything is fiction:** every name, domain (reserved `.example`) and ticker is invented, every record is `synthetic` and at most `issuer_attested`, every price, NAV, supply and trade is `simulated`.

## What changed

| Area            | Change                                                                                                                                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| catalogue data  | `scripts/lib/catalogue-rich-*.ts`: 15 invented issuers in 15 jurisdictions, 27 more claims (33 in all), 45 more tokens (53 in all), 20 more relationships. Phase 1 exports (`ISSUERS`, `CLAIMS`, `REPRESENTATIONS`, `RELATIONSHIPS`) are untouched, so every existing test passes unchanged. |
| tiers           | `--catalogue=mvp\|demo\|full` on `deploy-testnet`, `seed-catalogue`, `seed-profiles`, `catalogue-plan` and `demo:seed`. `mvp` seeds nothing beyond the MVP pair (what the end-to-end suite uses), `demo` (default) is 26 tokens, `full` is 53.                                               |
| seed            | Relationships can be rejected, `ECONOMICALLY_SIMILAR`, proposed or approved with a guard preset (`fund`, `stable`, `equity`, `commodity`, `illiquid`); a delisted wrapper is moved to `deprecated`; the core account is topped up for registry state before registering.                     |
| dossiers        | 15 issuer and 27 claim dossiers in `docs/asset-dossiers`, **generated** from the data (`pnpm --filter @pontis/scripts gen-dossiers`) with a "FICTIONAL DEMO DATA" banner; a test fails if one drifts; the README index lists them.                                                           |
| market data     | `RICH_CLAIMS` price and NAV profiles for the 27 claims, merged with `DEFAULT_CLAIMS` (unchanged: same seed, same series) as `SIMULATED_CLAIMS`; supply start, growth and hourly flow tables per claim in `apps/simulator`.                                                                   |
| backfill speed  | Async ed25519 signing on the libuv threadpool, concurrent per-representation writes, JSON-parameter bulk inserts for prices, NAV and candles, narrower candle reads. Rows written are identical.                                                                                             |
| cost and loader | `catalogue-plan` prices each tier; `pnpm demo:seed` deploys, seeds, mirrors the registry, writes profiles and backfills the market in one command.                                                                                                                                           |
| docs            | `known-limitations`, `deliberately-mocked`, threat T50, `local-setup`, `deployments`, a [runbook](../runbooks/seed-demo.md), the simulator README.                                                                                                                                           |

## The catalogue

Tiers include each other: `demo` adds 18 tokens (14 issuers, 17 claims, 10 relationships in all) to the phase 1 catalogue; `full` adds the rest (19 issuers, 33 claims, 22 relationships).

- **Families covered:** short-dated treasury funds (NAV, daily strike) and a ladder fund; USD and EUR money-market funds; an investment-grade corporate bond fund; an index tracker and a technology basket; single shares (a volatile biotech, a utility with a split scheduled, a delisted retailer); gold by the kilogram, silver, crude oil, copper; commercial real estate (office, logistics), residential rental portfolio and a unique flat; private-credit notes with maturity (SME 2027, trade receivables 2026, redemption-gated); stable-value tokens (euro, yen, and a second dollar wrapper); nature-based and engineered carbon credits; a venture fund and a buyout fund; a unique painting.
- **Wrappers differ** in decimals and units per token (10 fund units, 1/10, 1/100, 1 gram of a kilogram, 100 yen), so approved ratios are not powers of ten of each other. The plan derives every ratio from the multipliers and a test compares it with the contract's rule.
- **Pairs:** 14 new approved `DIRECT_EQUIVALENT` pairs with a guard, one rejected, three proposed and two `ECONOMICALLY_SIMILAR` (proposed). The base `tustb` pair stays as it was.
- **Stories (all statuses a registrar set):** `kittiwake-cayman-partners` active then restricted; `wattlebird-capital` deprecated after a "lapsed attestation" (its three tokens' approved pairs cannot convert); `peninsula-orient-assets` pending (tokens registered, `restricted`); `baobab-coast-finance` rejected before issuing; `sakura-meadow-trust` active but `unverified`; a delisted share (`tmfr-p`, wrapper `deprecated`); a 3-for-1 split in a dossier only; a redemption-gated note.

## Decisions

- **Extend, do not edit.** The phase 1 arrays and every test that pins them stay; the rich entries live in new files with a `tier` field, and plan functions take the data as a defaulted argument (phase 1 when absent) so `buildCatalogue("x")` and friends behave as before. The CLI default is `demo`; `deploy-testnet` without the flag still deploys only the MVP, as before.
- **Dossiers are generated.** Forty-two hand-written dossiers would drift from the data they hash as evidence; a generator plus a drift test keeps them one thing.
- **A delisting is a registrar `deprecated`.** The two-account `request_delist` / `approve_delist` of ADR 0018 needs two accounts and the seed has one; the dossier says so.
- **The core account is topped up during the seed.** The deploy funds it with 1 NEAR beyond its code; the full tier's registry state needs about 2, so the seed sends the shortfall, counting only records not yet on chain, so a repeat sends nothing.
- **Three names were replaced after the denylist was written** (they matched a real offshore-vessel company, a real private-credit protocol and a real analytics product), which is the denylist doing its job; it is a guard, not a trademark search.
- **Single-wrapper claims get no trades.** A trade is a conversion between wrappers of one claim; prices, NAV and supply exist for every claim.

## Cost and size (estimates, nothing was deployed)

`pnpm --filter @pontis/scripts catalogue-plan`, slim token wasm 179,598 bytes, 2.80 NEAR per token account (0.00001 NEAR per byte plus 1 NEAR):

| Tier   | Tokens | Token accounts | Core registry | Transactions (deploy + seed) | Time, testnet / sandbox (assumed latency) |
| ------ | ------ | -------------- | ------------- | ---------------------------- | ----------------------------------------- |
| `mvp`  | 0      | 0 NEAR         | 0             | 0                            | none                                      |
| `demo` | 26     | 72.70 NEAR     | about 1.0     | 78 + 291                     | about 16 min / 4 min                      |
| `full` | 53     | 148.19 NEAR    | about 1.9     | 159 + 553                    | about 30 min / 8 min                      |

The NEAR figures follow from the deploy script's funding rule, the transaction counts from the plan, the registry size from a JSON-size heuristic; the **times use assumed latencies (2.5 s per final transaction on testnet, 0.6 s on a sandbox) and were not measured**.

## Simulated backfill (90 days, whole catalogue, Postgres 16 in Docker)

`apps/simulator` `backfill(db, 2026-11-11T12:00Z, 90 days)` on a fresh throwaway database in the `pontis-postgres` container (8 cores, Node 24, registry mirror filled from `catalogueFor(tier)`), measured with a scratch script that was deleted afterwards:

| Tier   | Representations | Wall time | Price points | NAV points | Supply snapshots | Trades | Candles |
| ------ | --------------- | --------- | ------------ | ---------- | ---------------- | ------ | ------- |
| `demo` | 26              | **57 s**  | 673,920      | 207,360    | 2,340            | 40,281 | 387,062 |
| `full` | 53              | **171 s** | 1,373,760    | 336,960    | 4,770            | 80,236 | 789,011 |

**The 3-minute target holds only on a quiet machine, and only just.** The `full` figure (171 s, 2.85 minutes, 281 s of Node CPU) was taken at a load average of 2 to 5. The same run took 268 s before the bulk-insert change and 298 to 440 s afterwards while other builds and test suites shared the machine (load average 10 to 26), so under load it is well over 3 minutes. Before any speed-up the cost was about 10.9 s per representation (87 s for the 8 phase 1 tokens, measured), which would be about 575 s for 53 (extrapolated, not measured at that size). What changed: ed25519 signing runs on the libuv threadpool (31 s of the run on 8 idle cores instead of about 150 s), representations are written and rebuilt concurrently over the pool, prices, NAV and candles are inserted as one JSON parameter per batch (`jsonb_to_recordset`, about twice as fast as drizzle's `.values()` in a 100,000-row test), and the candle builder reads only the columns it uses. The rows written are identical (the idempotency and attestation tests pass unchanged). What would cut it further without changing the data: fewer days (`SIM_BACKFILL_DAYS=30` is about a third), the `demo` tier, or dropping the redundant `price_points_rep_ts_idx` (a schema change, left alone). A repeated backfill still re-signs every point before the insert skips it, so it costs most of the first run; `run` and `tick` write small windows and are not affected.

## Verification

Run alone, in each package, with `DATABASE_URL=postgres://pontis:pontis@localhost:5439/pontis`: `tsc --noEmit` and `eslint .` are clean in `scripts`, `packages/market-data`, `apps/simulator` and `apps/api`; vitest passes in `scripts` (21 files, 150 tests), `packages/market-data` (15 files, 53 tests), `apps/simulator` (2 files, 11 tests) and `apps/api` (50 files, 262 tests); `tests/e2e` still type-checks (it seeds only the MVP and calls `deploy(chain, false)`). `prettier --check .` is clean.

The new tests pin the catalogue's invariants: at least 14 issuers in 8 jurisdictions, 30 claims and 40 tokens; unique ids, symbols and token accounts; ids and texts within the contract's limits; every token's issuer authorized for its claim's category; every pair's ratio equal to the multiplier-derived ratio and a same-claim pair for `DIRECT_EQUIVALENT`; no verification above `issuer_attested`; every record `synthetic` and every piece of evidence `issuer_provided`; every status move one a registrar may request; approvals only where both tokens are activated; vaults only for approved pairs; unique assets one non-convertible token; closure of each tier; a simulated profile for every claim; no name, id or story matching a denylist of real brands, no symbol matching a real ticker (`scripts/test/real-brands.ts`); the generated dossiers equal to the committed ones and carrying the banner; the relationship seed steps (propose, evidence, approve, guard, reject, leave proposed) over a fake chain; the core top-up arithmetic; and the `demo:seed` option parser.

## Not done

- No deploy, no sandbox end-to-end run and no Rust build were run; the chain steps (`seed-catalogue` against a node, the core top-up, the guards and the rejection) are covered by unit tests over a fake chain, not exercised on one. The first real run is the check.
- The estimated deploy and seed times, and the NEAR for core storage, are not measurements.
- `ECONOMICALLY_SIMILAR` pairs stay proposed: the contract does not check their ratio, and nothing converts through them.
- No corporate action, NAV strike, lifecycle stage or price relay is set on chain for the new claims; the operator commands exist ([corporate actions](../runbooks/corporate-actions.md), [price guards](../runbooks/price-guards.md)).
