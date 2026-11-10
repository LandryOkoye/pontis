# @pontis/api

Fastify REST API for the Pontis MVP (testnet, synthetic assets only). It serves the catalog, health, route comparison, signed quotes, conversions and transaction history.

## Run locally

```bash
POSTGRES_PORT=5432 pnpm db:up            # Postgres 16 (set POSTGRES_PORT if 5432 is taken)
cp apps/api/.env.example apps/api/.env   # set PONTIS_CORE_ACCOUNT_ID after deploying (docs/architecture/deployments.md)
pnpm --filter @pontis/api start          # migrates, starts on :3000, syncs the registry every 15 s
```

`pnpm --filter @pontis/api sync` copies the on-chain registry into Postgres once and exits. The database is a cache of the chain: it can be dropped and rebuilt with `db:migrate` and `sync`.

## Endpoints

`POST /v1/routes/compare`, `POST /v1/quotes` (201, or 422 with a reason code), `GET /v1/quotes/{id}`, `POST /v1/conversions` (needs an `Idempotency-Key` header), `POST /v1/conversions/{id}/submitted`, `GET /v1/transactions/{id}`, `GET /v1/transactions?account=`, `GET /v1/health`, `GET /v1/health/live`, `GET /v1/health/ready`, `/v1/issuers`, `/v1/issuers/{id}`, `/v1/assets`, `/v1/assets/{id}`, `/v1/assets/{id}/compatibility`. Paths and schemas come from `@pontis/api-types`, and each response is validated against its schema before it is sent. Errors are `{code, message, details?}`.

## Quotes

`POST /v1/quotes` checks the live route on-chain (`get_route`), eligibility (`is_allowed` for both assets), the fee and the vault inventory, computes the output with `@pontis/quote-engine` (the same math and byte layout `pontis-core` verifies), signs it with `QUOTE_SIGNER_SECRET_KEY`, and stores it as `QUOTED` for 60 seconds. Refusals are `422`: `NOT_DIRECT_EQUIVALENT`, `RELATIONSHIP_SUSPENDED`, `ASSET_PAUSED`, `NOT_ELIGIBLE`, `INSUFFICIENT_INVENTORY`. A background sweep (and every `GET /v1/quotes/{id}`) marks quotes past their expiry `EXPIRED`. On start the server warns if the on-chain signer differs from the configured key, because the contract would reject every quote.

## Conversions

`POST /v1/conversions` with `{quoteId}` and an `Idempotency-Key` accepts a quote once and returns the **unsigned** wallet actions: an optional `storage_deposit` on the destination token, then `ft_transfer_call` with the signed quote. The wallet signs and sends them (one transaction per receiver, in order) and then reports the hash to `POST /v1/conversions/{id}/submitted`. Settlement states (`SETTLED`, `FAILED`, `REQUIRES_RECONCILIATION`) are set by [the indexer](../indexer/README.md); without it running, a submitted conversion stays `SUBMITTED`.

### Hardening

Settings are in `.env.example`; reasons are in [ADR 0013](../../docs/decisions/0013-api-hardening.md).

| Variable                                                    | Default                 | Meaning                                                              |
| ----------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `CORS_ORIGIN`                                               | `http://localhost:5173` | Comma-separated browser origins; exact origins only                  |
| `RATE_LIMIT_READ` / `RATE_LIMIT_WRITE` / `RATE_LIMIT_ADMIN` | `120` / `30` / `10`     | Requests per client per window, by class                             |
| `RATE_LIMIT_WINDOW_MS`                                      | `60000`                 | Window length                                                        |
| `TRUST_PROXY`                                               | `false`                 | Read the client address from `X-Forwarded-For` (behind a proxy only) |
| `ADMIN_API_KEY`                                             | unset                   | Bearer key for `/v1/admin/*`; at least 16 characters                 |

An excess request gets `429` with `Retry-After`. Logs hold method and path only; every admin call is written to `audit_log`.

### Health

Three probes, each answering a different question. None of them needs a key.

| Endpoint               | Question                     | Answers                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health/live`  | Is the process up?           | Always `200 {"status":"ok"}`. Touches no database, RPC or indexer state. Use it for restart probes.                                                                                           |
| `GET /v1/health/ready` | Can it do its job right now? | `200` when the database and RPC answer and the indexer is `running` or `lagging`; `503` when the database or RPC is down or the indexer is `never_run` or `stale`. Same body as `/v1/health`. |
| `GET /v1/health`       | The combined view            | Always `200` while the process answers; the body carries the verdict. Keeps `status`, `chainHeight` and `indexerLagBlocks`, and adds `database`, `rpc` and `indexer`.                         |

`/v1/health` stays `200` so existing callers (the web app, the e2e harness) that read the body keep working; use `/v1/health/ready` when a load balancer or monitor should react to the status code. A lagging indexer is still ready: quotes and catalog reads work and only settlement is late, and the body says `degraded` with the lag. A database outage, a chain RPC outage (no quoting) or an indexer that never ran or went silent is not ready.

The body:

```json
{
  "status": "ok",
  "chainHeight": 200000000,
  "indexerLagBlocks": 2,
  "database": true,
  "rpc": true,
  "indexer": {
    "state": "running",
    "lagBlocks": 2,
    "lastHeartbeatAt": "2026-11-07T18:00:00.000Z",
    "heartbeatAgeMs": 1500
  }
}
```

- `status` is `ok` only when `database` and `rpc` are true and `indexer.state` is `running`. Anything else is `degraded`. A never-run or stale indexer can never give `ok`.
- `database` is false when `select 1` or the cursor read fails. The indexer is then unknown: `indexer` is `null`.
- `rpc` is false when the chain height cannot be read. `chainHeight` and the lag are then `null`, and a fresh indexer is reported `running` because its lag cannot be judged; `status` is still `degraded`.
- `indexer.state`:
  - `never_run`: the indexer has not written its cursor.
  - `stale`: the last heartbeat is older than `INDEXER_STALE_AFTER_MS`. This covers a stopped process, a crashed one and one that fails every pass (for example its RPC is down); they cannot be told apart, because the indexer writes no stop marker. Look at the indexer's log. A first pass that creates the cursor and then fails also reads `stale`: the cursor starts with an epoch heartbeat.
  - `lagging`: the heartbeat is fresh but the indexer is more than `INDEXER_MAX_LAG_BLOCKS` behind the chain.
  - `running`: heartbeat fresh and within the lag limit.
- The heartbeat is `indexer_cursor.updated_at`, set by the database clock. The indexer stamps it each time it applies a block and each time a pass succeeds with nothing new; a failed pass does not. The age is measured with the API's clock, so a large clock difference between the API host and the database shifts it (a negative age is shown as `0`).

| Variable                 | Default | Meaning                                                                                                                                                                                               |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INDEXER_STALE_AFTER_MS` | `30000` | Heartbeat age after which the indexer is `stale` (at least 1000). Keep it well above the indexer's poll and retry pauses (default poll 2 s, retries back off up to 60 s, so a long outage goes stale) |
| `INDEXER_MAX_LAG_BLOCKS` | `50`    | Blocks behind the chain after which a live indexer is `lagging`                                                                                                                                       |

### Admin

`GET /v1/admin/reconciliation` returns the reconciler's last run (findings, each vault's inventory against the tokens the core holds) and the quotes waiting in `REQUIRES_RECONCILIATION`. It needs `Authorization: Bearer $ADMIN_API_KEY` (at least 16 characters); with no key set it refuses everyone.

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" $API/v1/admin/reconciliation
```

### Running with the indexer

The API alone accepts quotes and records hashes. Run the indexer next to it so conversions settle without the wallet's help. Without it `GET /v1/health` reports `degraded` (`indexer.state` is `never_run`) and `/v1/health/ready` answers `503`:

```bash
pnpm --filter @pontis/api start        # terminal 1
pnpm --filter @pontis/indexer start    # terminal 2, same DATABASE_URL and PONTIS_CORE_ACCOUNT_ID
```

Both apply migrations on start. A conversion is `SETTLED` a few seconds after its transaction finalizes; poll `GET /v1/transactions/{id}` for it.

### Walkthrough

```bash
API=http://localhost:3000
# 1. Is the pair convertible, and why or why not?
curl -s $API/v1/routes/compare -H 'content-type: application/json' -d '{"fromId":"tgold-a","toId":"tgold-b","amount":"1000000"}'
# 2. A signed 60 s quote for 1 TGOLD-A (1000000 smallest units)
curl -s $API/v1/quotes -H 'content-type: application/json' \
  -d '{"fromId":"tgold-a","toId":"tgold-b","amountIn":"1000000","accountId":"alice.testnet"}'
# 3. Accept it: the response lists the unsigned actions for the wallet to sign
curl -s $API/v1/conversions -H 'content-type: application/json' -H "Idempotency-Key: $(uuidgen)" -d '{"quoteId":"<quote id>"}'
# 4. After the wallet sends the transaction, report its hash
curl -s $API/v1/conversions/<conversion id>/submitted -H 'content-type: application/json' -d '{"txHash":"<hash>"}'
curl -s "$API/v1/transactions?account=alice.testnet"
```

## Database

Drizzle schema (12 tables) and migrations live in the shared `packages/db` (`@pontis/db`), which the indexer also uses. Generate a migration with `pnpm --filter @pontis/db db:generate --name <name>`. Amounts and ratio parts are `numeric(39, 0)` and travel as strings.

## Tests

`pnpm --filter @pontis/api test` needs Postgres at `DATABASE_URL` (default `postgres://pontis:pontis@localhost:5432/pontis`). Each test file creates and drops its own database.
