# Frontend handoff

What the API serves for each screen, how to read it, and what is not there yet. Kept in step with `packages/api-types` (schemas, `openapi.yaml`, fixtures). If a screen needs something that is not listed here, ask for it; do not infer it.

- **Contract:** `packages/api-types` (`ENDPOINTS`, Zod schemas, `openapi.yaml`). Example payloads for every endpoint: `import * as fx from "@pontis/api-types/fixtures"`.
- **No chain needed:** run the API with `API_MODE=fixtures` ([API README](../../apps/api/README.md), `apps/api/.env.example`). It serves the same fixtures, validates requests like the real server, marks every response `x-pontis-mode: fixtures`, and answers 404 for what needs a live chain (`compareRoutes`, `createConversion`, `markConversionSubmitted`, `submitReserveAttestation`, the four auth endpoints, admin, Prometheus `/metrics`); `getRouteGuards` is served from a fixture.
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

| #   | Screen                | Endpoints                                                                                                                                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Market overview       | `GET /market/overview`, `/market/movers`, `/market/categories`, `/market/chains`, `/issuers/leaderboard`                                                                            | Totals include only assets that have the figure; `totalMarketCap: null` means no asset has a known supply. `change24hBps` is market-cap weighted. No "trending" list exists.                                                                                                                                                                                                                                                                 |
| 2   | Asset directory       | `GET /assets` (`q`, `category`, `issuerId`, `chain`, `verification`, `status`, `convertible`, `bridgeable`, `sort`, `order`, `limit`, `cursor`, `data`)                             | Rows carry `market` and a 7 day `sparkline` (both null without a price). Sorting by a figure puts nulls last. `convertible` means an approved parity route exists.                                                                                                                                                                                                                                                                           |
| 3   | Asset detail          | `GET /assets/{id}`, `/metadata`, `/issuer`, `/chains`, `/documents`, `/compatibility`, `/activity`, `/lifecycle`, `/corporate-actions`, `/nav`, `/charts/{price,nav,supply,volume}` | Tabs without data return empty lists or a null `profile`, not errors. `/lifecycle`, `/corporate-actions` and `/nav` are read live from the chain (see below); custody, reserves and redemption terms are in the section below.                                                                                                                                                                                                               |
| 4   | Compare               | `GET /compare?ids=a,b,c`                                                                                                                                                            | `pairs` gives parity ratio (from the registry), implied market ratio and deviation. The implied ratio is `null` when one price is real and the other simulated.                                                                                                                                                                                                                                                                              |
| 5   | Trade                 | `POST /routes/compare`, `POST /quotes`, `GET /quotes/{id}`, `POST /conversions`, `POST /conversions/{id}/submitted`, `GET /transactions`                                            | Parity conversion only. No price impact, slippage, depth or multi-source quotes yet. A pair can refuse with `PRICE_*`, `AMOUNT_*` or the action and lifecycle codes (`CORPORATE_ACTION_FREEZE`, `CORPORATE_ACTION_PENDING`, `EPOCH_MISMATCH`, `NOT_CONVERTIBLE`, `LIFECYCLE_BLOCKED`, `NAV_WINDOW_CLOSED`, `RESERVE_RESTRICTED`, `RESERVE_STALE`): show `message`, and fetch `GET /routes/{from}/{to}/guards?amount=` for the failing check. |
| 6   | Portfolio             | `GET /transactions?account=`                                                                                                                                                        | History only. No balances, positions, PnL or LP views yet.                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | Issuers               | `GET /issuers`, `/issuers/{id}`, `/issuers/leaderboard`, `GET /assets/{id}/issuer`                                                                                                  | `reliabilityScore` on the issuer list is still `null`; `GET /issuers/{id}/reliability` serves the redemption record and a derived score, labelled simulated. Evidence keeps its `provenance`; nothing is third-party verified yet.                                                                                                                                                                                                           |
| 8   | Watchlists and alerts | not served                                                                                                                                                                          | Needs accounts and a delivery channel.                                                                                                                                                                                                                                                                                                                                                                                                       |
| 9   | Status                | `GET /status`, `GET /health`                                                                                                                                                        | `prices.real` and `prices.simulated` are reported apart. `reserves` and `bridge` are `null` until they exist. `incidents` is empty.                                                                                                                                                                                                                                                                                                          |

## Charts

`GET /assets/{id}/charts/{price,nav,supply,volume}?interval=1m|5m|15m|1h|4h|1d&from=&to=&data=` returns `{representationId, interval, from, to, points, source, simulated, filledPoints}`.

- `to` defaults to now and `from` to 500 buckets before it. More than 5000 buckets is a 400.
- **`filled: true`** marks a bucket with no observation of its own; its value is carried forward. Draw it dashed or dimmed, and use `filledPoints` to judge how sparse a series is. One-minute and five-minute candles exist only for the last two days and are mostly filled.
- **Volume is units moved**, valued at the bucket's close. A parity conversion has no market price of its own, so this is not a market-volume measure. Real conversions only appear in a candle when a real price exists for the bucket, which is not the case yet.
- NAV and supply: the last value before the end of each bucket. An asset without a NAV has empty NAV `points`.

## Lifecycle, corporate actions and NAV strikes

Three read endpoints on `GET /assets/{id}/...`, where `{id}` is a representation (for example `tgold-a`). All three read the chain on each request (a few seconds of shared caching applies, like other public reads) and answer 404 for an unknown asset. Fixtures mode serves examples: `tnav-a` is the NAV fund example.

- **`/lifecycle`**: `{assetId, kind, stage, noConversion, bridgeOnly, history[], delistRequest}`. `kind` is `fungible | nav_fund | term_instrument | unique`; an asset with no record is `fungible` in stage `active`. Show a badge for any stage but `active` or a conversion flag: the asset's routes are closed (`NOT_CONVERTIBLE`, `LIFECYCLE_BLOCKED`). `delistRequest` is a registrar's request that is waiting for a second account. `nav_strike_window` is a reserved stage name that is never stored; use `/nav` for a fund's window.
- **`/corporate-actions`**: `{assetId, canonicalAssetId, items[], multiplierEpochs[]}`. Actions belong to the claim and affect every wrapper of it. Each item has `kind`, stored `status` (`proposed | approved | applied | cancelled`), `effectiveAt`, the freeze window (`freezeFrom`, `freezeUntil`) and `freezeActive` (true while an approved action's window is open), `multiplierChange` (`{num, den}`, applied to every wrapper's multiplier; null when it does not move it), `evidence[]` with its `provenance`, `proposedBy`/`approvedBy`, a per-wrapper `wrappers[]` (`{representationId, live, applied}`: a `live` wrapper that has not `applied` keeps the claim's routes closed as `CORPORATE_ACTION_PENDING` once the action is effective; a rejected or deprecated wrapper is not `live` and need not apply) and `history[]`. `multiplierEpochs[]` is each wrapper's schedule, oldest first; the first entry has `effectiveAt: null` and `actionId: null` (the registration multiplier). **The facts are entered by the registrar**: show the evidence `provenance` and do not present an action as independently verified.
- **`/nav`**: `{assetId, kind, strike}`. `strike` is null for an asset that is not a `nav_fund` and for a fund before its first strike, else `{navPerUnit, currency, asOf, cutoff, submittedAt, source, simulated, publisherKey, windowState}`. A fund converts only while `windowState` is `open` (`[asOf, cutoff)`); `upcoming` and `closed` give `NAV_WINDOW_CLOSED`. **Render `simulated` and `source`**: every strike the demo publishes is simulated.

## Custody, reserves and redemption

Phase 4. **Everything here is simulated and none of it is backed, custodied, audited or redeemable for value**: the custodians and issuers are simulators holding test keys, and a reserve figure is a number a fictional custodian signed. Every response carries `simulated`, `sources` and a `notice`; show the badge and the notice next to any figure from these endpoints, and never word them as "backed", "fully backed", "audited", "verified" or "secured". Say "attested by a simulated custodian". Every endpoint reads the chain on each request (a few seconds of shared caching applies) and answers 404 for an unknown asset or record, 400 for bad parameters. Fixtures mode serves examples of all of them except the relay.

| Endpoint                                                          | What it serves                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /custodians`, `/custodians/{id}`                             | Registered custodians: `name`, `jurisdiction`, `attesterKey`, `status` (`active`, `suspended`, `retired`), `synthetic`, `verificationStatus`, `evidence[]` with its `provenance`. Oldest first, `limit` and `cursor`.                  |
| `GET /assets/{id}/custody`                                        | `{linked, structure, custodians[], linkedBy, linkedAt}`. `structure` is `segregated`, `omnibus` or `on_chain_vault`. `linked: false` means nobody is recorded as holding reserves: say so, do not hide the tab.                        |
| `GET /assets/{id}/reserves`                                       | The reserve status, below.                                                                                                                                                                                                             |
| `GET /assets/{id}/reserves/history`                               | Attestations newest first (`seq`, `custodianId`, `reservedUnits`, `asOf`, `reportUri`, `reportHash`, `attesterKey`, `simulated`, `source`), `limit` and `cursor`. The chain keeps the last 500 per asset.                              |
| `GET /assets/{id}/redemption-terms`                               | Enforced terms beside the free-text `description`, below.                                                                                                                                                                              |
| `GET /issuers/{id}/reliability`                                   | Redemption counters (`requested`, `accepted`, `fulfilled`, `rejected`, `expired`, `acceptMisses`, `fulfilMisses`, `reclaimed`, `lastMissAt`) and a derived `score` (rates in basis points, `null` before any request; averages in ms). |
| `GET /redemptions?user=&representationId=&status=&limit=&cursor=` | Newest first. Needs `user` or `representationId` (400 otherwise). `status` filters within a page, so a page can have fewer than `limit` items while `nextCursor` is set: keep paging until it is null.                                 |
| `GET /redemptions/{id}`                                           | One redemption and its `timeline` (`requested`, `accepted`, `rejected`, `expired`, `fulfilled`, `reclaimed`; `at` and `txHash` can be null, show "time not recorded").                                                                 |
| `POST /reserves/attestations`                                     | Relay for the simulated custodian: `{attestation, signature, publicKey}`. Not for the web app. `201 {txHash, ...}`; `422 ATTESTATION_REJECTED` when the contract refuses; 404 where no relayer is configured.                          |

**Reserve status** (`GET /assets/{id}/reserves`). The contract computes it on every read; the API never stores or smooths it.

- `state`: `ok`, `breached` (supply above attested reserves plus tolerance), `stale` (the oldest attestation is older than the policy allows), `no_attestation`, or `unmonitored` (no policy: show "not monitored", never "ok"). `explanation` is plain-language text for the state.
- **Ratio.** `ratioBps` is attested over circulating in basis points, rounded down; **render `ratioPercent`** (`"125.00"`) with a `%`. `null` means nothing circulates: show a dash, not 0 and not infinity. Never divide the unit strings in a float. `attestedUnits`, `limitUnits`, `circulatingUnits` and `headroomUnits` are smallest units of the token (format with the asset's `decimals`); `headroomUnits` is what may still be minted.
- **Freshness.** `freshness` is `fresh`, `stale` or `none`; `ageMs` is the age of the oldest counted attestation and `policy.maxReserveAgeMs` the limit. Per custodian, `custodians[].latest.fresh` and `ageMs`. Show "as of {asOf}", not "now". A suspended or retired custodian has `counted: false`.
- **Effect.** `restrictsConversions` true means conversions of this asset are refused now (`RESERVE_RESTRICTED` for a breach, `RESERVE_STALE` for stale or missing attestations); `mintPaused` is the same for minting. Show it as a state of the asset, with the quote's `message` where the user hit it. A `warn` policy never restricts; it only shows.
- **Simulated badge.** Show it whenever `simulated` is true, which is always in the demo, with `sources` (for example `simulated_custodian`) and the `notice`. The `source` of each attestation is shown as stored.
- `reportUri` and `reportHash` are what the custodian pointed to. The API does not fetch or check the report: show the URI as a reference, never as a verified document.

**Redemption terms.** `terms` is `null` until the registrar sets them: the asset cannot be redeemed, say that. Otherwise `minAmount`, `maxAmount` (`null` = none), `feeBps`, `window` (`alwaysOpen`, `open` now, `nextOpenAt`), `acceptWithinMs` (the issuer's time to accept) and `settlementDays` (its time to fulfil). `termsHash` and `version` identify the terms: a redemption made under older terms is refused, so re-read before building one. **Redemption pays no value**: `feeUnits` and `netUnits` of a redemption are what a simulated issuer would owe off-chain. The whole `amount` is escrowed and burned on fulfilment, or returned by a reclaim (`reclaimable` says when it is possible).

**Refusal codes.** `RESERVE_RESTRICTED` and `RESERVE_STALE` come as `422` on `POST /quotes` and `POST /routes/compare` (`reasonCode`), and as `reasonCode` on a failed `reserves` line of the guards breakdown (`detail` is `<asset>: <state>, ratio <bps>`; one line per monitored leg). Both legs of a route are checked. `REDEMPTION_WINDOW_CLOSED`, `REDEMPTION_BELOW_MIN`, `REDEMPTION_ABOVE_MAX` and `REDEMPTION_TERMS_CHANGED` are in the error code list for the redemption prepare endpoint, which needs sign-in and is not served yet.

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

## Auth

Only operators sign in (users are authorised by their wallet signature on each transfer). Sign-in is NEP-413 `signMessage`: it proves the wallet holds an access key of the account, signs no transaction and moves nothing. The four endpoints answer 404 in fixtures mode.

1. `POST /v1/auth/challenge` with `{accountId}` returns `{accountId, nonce, recipient, message, expiresAt}`. `nonce` is base64 of 32 bytes, single use, valid 5 minutes (until `expiresAt`).
2. Call the wallet's `signMessage` with exactly these parameters (wallet selector: `wallet.signMessage(...)`):

   ```ts
   const { signature, publicKey, accountId } = await wallet.signMessage({
     message: challenge.message, // byte for byte, do not trim or re-wrap
     recipient: challenge.recipient, // e.g. "pontis-api.testnet"
     nonce: Buffer.from(challenge.nonce, "base64"), // the 32 bytes, not the base64 text
     // callbackUrl: omit. Browser wallets (MyNearWallet) default it to the page URL and sign over it.
   });
   ```

   The wallet signs `sha256(u32le(2^31+413) ++ borsh({message, nonce, recipient, callbackUrl?}))` with ed25519 (NEP-413; the same bytes are pinned by `test-vectors/nep413.json`). Show the user the recipient and message: that is the phishing defence.

3. `POST /v1/auth/verify` with `{accountId, publicKey, signature, nonce, callbackUrl?}`: `publicKey` is the wallet's `ed25519:<base58>`, `signature` its **base64** signature (convert if the wallet returns bytes), `nonce` the challenge's base64 unchanged. **If the wallet signed over a callback URL** (a browser wallet that redirects back does), send the same string as `callbackUrl`; without it the signature fails. The answer is `{token, tokenType: "Bearer", accountId, roles, keyType, expiresAt, maxExpiresAt}`.
4. Send the session on every admin call: `Authorization: Bearer <token>` (also CORS-allowed). Keep the token in memory or `sessionStorage`; it is shown once.
5. `GET /v1/auth/me` returns `{accountId, roles, expiresAt}`; use it to decide what the operator screens show. `POST /v1/auth/logout` ends the session at once.

Behaviour to design for:

- **Lifetime**: 15 minutes from the last authenticated request (each request renews it), and never past `maxExpiresAt` (8 hours from sign-in). A `401` on an admin call means sign in again.
- **Roles** are the contract's `get_account_roles` at sign-in, refreshed after 60 seconds, so a change reaches the UI within about a minute. Names: `owner`, `registrar`, `compat_approver`, `pauser`, `attester`, `reserve_attester`, `bridge_attester`. `roles: []` is valid: the account signed in and holds no admin rights. Hide admin screens, and expect `403 FORBIDDEN` if called anyway.
- **Admin endpoints** (`/v1/admin/reconciliation`, `/v1/admin/metrics`) accept any of `owner`, `registrar`, `compat_approver`, `pauser`. `attester` roles do not open them.
- **`keyType`** is `full_access` or `function_call` (accepted, recorded). Prefer a full-access key: that is what NEP-413 asks for.
- **Errors**: `401 UNAUTHORIZED` (unknown, used or expired challenge; wrong signature; key not on the account; expired session), `403 FORBIDDEN`, `429` (sign-in is limited per address; the admin allowance). Refusals carry a plain message to show.
- Sign-in responses are `no-store`. The `ADMIN_API_KEY` break-glass key is not a session; the frontend never uses it.

## Not available yet

These are in the brief and not in the API. They arrive with the phase named, and this document changes with them.

| Feature                                                                               | Phase |
| ------------------------------------------------------------------------------------- | ----- |
| Issuer onboarding, attestations, account sign-in, issuer portal                       | 3     |
| Holders, issuer queue, redemption prepare and reclaim, mint requests (need sign-in)   | 4     |
| Pools, LPs, market-priced quotes, depth, trade and portfolio endpoints, SSE streams   | 5     |
| Bridge routes and transfers, `chains` supply across real chains                       | 6     |
| Private RFQ                                                                           | 8     |
| Feature                                                                               | Phase |
| ------------------------------------------------------------------------------------- | ----- |
| Issuer onboarding, attestations, issuer portal (cut: issuers are mock data, ADR 0019) | —     |
| Reserves, custody, redemption, holders                                                | 4     |
| Pools, LPs, market-priced quotes, depth, trade and portfolio endpoints, SSE streams   | 5     |
| Bridge routes and transfers, `chains` supply across real chains                       | 6     |
| Private RFQ                                                                           | 8     |

## Changes to existing endpoints

- **`GET /v1/admin/reconciliation`, `GET /v1/admin/metrics`, `GET /metrics`** (additive): accept a wallet session (see Auth) as well as the break-glass admin key; a session whose account holds no operator role gets `403` with the new error code `FORBIDDEN`. The `401` message now says a session or admin key is required.

- **`GET /v1/assets`** (additive, but the response shape grew): `items[]` gained `category`, `tags`, `chains`, `convertible`, `bridgeable`, `market`, `sparkline`; the body gained `nextCursor` and `total`; it accepts the query parameters above. The default order is still by `id`. Existing readers of `items[].id`, `symbol`, `name`, `issuer`, ... are unaffected.

- **`POST /v1/quotes` and `POST /v1/routes/compare`** (additive): new refusal `code` values `PRICE_DEVIATION`, `PRICE_STALE`, `PRICE_UNAVAILABLE`, `AMOUNT_BELOW_MIN`, `AMOUNT_ABOVE_MAX`, `WINDOW_LIMIT_EXCEEDED` on a pair that has a route guard. A pair without a guard behaves as before. An open circuit breaker is `RELATIONSHIP_SUSPENDED`. `feeBps` of a quote can now exceed the base fee on a guarded pair: it includes a skew that rises as the destination vault drains, and is the fee the contract will charge.
- **`GET /v1/routes/{fromId}/{toId}/guards?amount=`** (new): every guard check with its verdict and, for an amount, the effective `feeBps` and `skewBps`. `prices[]` are the reference prices the contract holds, each with `ageMs`, `source` and `simulated`. **Render the `simulated` flag**: the demo publishes simulated prices only, so a "market price agrees" message is a statement about the simulator.
- **Compatibility `history[].action`** gained `guard_set`: a guard was set or changed (the ratio and status did not). It also gained `multiplier_epoch` (a wrapper's multiplier moved by a corporate action) and `lifecycle_flags` (a representation's kind or conversion flags changed); the ratio is unchanged in both, the version moves.
- **`POST /v1/quotes` and `POST /v1/routes/compare`** (additive): new refusal `code` values `CORPORATE_ACTION_FREEZE`, `CORPORATE_ACTION_PENDING`, `EPOCH_MISMATCH`, `NOT_CONVERTIBLE`, `LIFECYCLE_BLOCKED` and `NAV_WINDOW_CLOSED`, each with a plain-language `message`. The same codes appear as `reasonCode` on the failing lines of the guards breakdown (`corporate_action_freeze`, `corporate_action_pending`, `epoch_mismatch`, `not_convertible`, `lifecycle_blocked`, `nav_window_closed`; a line is per claim or per asset, and `passed` means the refusal does not apply).
- **`POST /v1/quotes` and `POST /v1/routes/compare`** (additive): new refusal `code` values `RESERVE_RESTRICTED` and `RESERVE_STALE` on an asset with a reserve policy. The error code list also gained `REDEMPTION_*` (not yet returned) and `ATTESTATION_REJECTED` (relay only).
- **A quote's `expiresAt` can be shorter than 60 seconds**: it never outlives the start of the next approved corporate-action freeze of either claim. Show the countdown from `expiresAt`, not from a fixed lifetime.
