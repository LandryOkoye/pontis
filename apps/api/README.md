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

`POST /v1/routes/compare`, `POST /v1/quotes` (201, or 422 with a reason code), `GET /v1/quotes/{id}`, `POST /v1/conversions` (needs an `Idempotency-Key` header), `POST /v1/conversions/{id}/submitted`, `GET /v1/transactions/{id}`, `GET /v1/transactions?account=`, `GET /v1/health`, `/v1/issuers`, `/v1/issuers/{id}`, `/v1/assets`, `/v1/assets/{id}`, `/v1/assets/{id}/compatibility`. Paths and schemas come from `@pontis/api-types`, and each response is validated against its schema before it is sent. Errors are `{code, message, details?}`.

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

### Admin

`GET /v1/admin/reconciliation` returns the reconciler's last run (findings, each vault's inventory against the tokens the core holds) and the quotes waiting in `REQUIRES_RECONCILIATION`. It needs `Authorization: Bearer $ADMIN_API_KEY` (at least 16 characters); with no key set it refuses everyone.

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" $API/v1/admin/reconciliation
```

### Running with the indexer

The API alone accepts quotes and records hashes. Run the indexer next to it so conversions settle without the wallet's help and `GET /v1/health` reports a real `indexerLagBlocks`:

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
# 4. After the wallet sends the transaction, report its hash. The API checks it against the chain:
#    another wallet's or another quote's transaction is 422; a hash the node does not know yet is kept
#    as `reportedTxHash` (`txHashStatus: REPORTED`) and `txHash` stays null until it is verified.
#    Link to an explorer only when `txHash` is set.
curl -s $API/v1/conversions/<conversion id>/submitted -H 'content-type: application/json' -d '{"txHash":"<hash>"}'
curl -s "$API/v1/transactions?account=alice.testnet"
```

## Database

Drizzle schema (12 tables) and migrations live in the shared `packages/db` (`@pontis/db`), which the indexer also uses. Generate a migration with `pnpm --filter @pontis/db db:generate --name <name>`. Amounts and ratio parts are `numeric(39, 0)` and travel as strings.

## Tests

`pnpm --filter @pontis/api test` needs Postgres at `DATABASE_URL` (default `postgres://pontis:pontis@localhost:5432/pontis`). Each test file creates and drops its own database.
