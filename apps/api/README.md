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

`POST /v1/conversions` with `{quoteId}` and an `Idempotency-Key` accepts a quote once and returns the **unsigned** wallet actions: an optional `storage_deposit` on the destination token, then `ft_transfer_call` with the signed quote. The wallet signs and sends them (one transaction per receiver, in order) and then reports the hash to `POST /v1/conversions/{id}/submitted`. Settlement states (`SETTLED`, `FAILED`, `REQUIRES_RECONCILIATION`) are set by the indexer in B12; until then a submitted conversion stays `SUBMITTED`.

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

Drizzle schema in `src/db/schema/` (12 tables), migrations in `drizzle/` (generated: `pnpm --filter @pontis/api db:generate --name <name>`). Amounts and ratio parts are `numeric(39, 0)` and travel as strings.

## Tests

`pnpm --filter @pontis/api test` needs Postgres at `DATABASE_URL` (default `postgres://pontis:pontis@localhost:5432/pontis`). Each test file creates and drops its own database.
