# @pontis/api

Fastify REST API for the Pontis MVP (testnet, synthetic assets only). It serves the catalog, health, route comparison and signed quotes; conversions arrive with B11.

## Run locally

```bash
POSTGRES_PORT=5432 pnpm db:up            # Postgres 16 (set POSTGRES_PORT if 5432 is taken)
cp apps/api/.env.example apps/api/.env   # set PONTIS_CORE_ACCOUNT_ID after deploying (docs/architecture/deployments.md)
pnpm --filter @pontis/api start          # migrates, starts on :3000, syncs the registry every 15 s
```

`pnpm --filter @pontis/api sync` copies the on-chain registry into Postgres once and exits. The database is a cache of the chain: it can be dropped and rebuilt with `db:migrate` and `sync`.

## Endpoints

`POST /v1/routes/compare`, `POST /v1/quotes` (201, or 422 with a reason code), `GET /v1/quotes/{id}`, `GET /v1/health`, `/v1/issuers`, `/v1/issuers/{id}`, `/v1/assets`, `/v1/assets/{id}`, `/v1/assets/{id}/compatibility`. Paths and schemas come from `@pontis/api-types`, and each response is validated against its schema before it is sent. Errors are `{code, message, details?}`.

## Quotes

`POST /v1/quotes` checks the live route on-chain (`get_route`), eligibility (`is_allowed` for both assets), the fee and the vault inventory, computes the output with `@pontis/quote-engine` (the same math and byte layout `pontis-core` verifies), signs it with `QUOTE_SIGNER_SECRET_KEY`, and stores it as `QUOTED` for 60 seconds. Refusals are `422`: `NOT_DIRECT_EQUIVALENT`, `RELATIONSHIP_SUSPENDED`, `ASSET_PAUSED`, `NOT_ELIGIBLE`, `INSUFFICIENT_INVENTORY`. A background sweep (and every `GET /v1/quotes/{id}`) marks quotes past their expiry `EXPIRED`. On start the server warns if the on-chain signer differs from the configured key, because the contract would reject every quote.

## Database

Drizzle schema in `src/db/schema/` (12 tables), migrations in `drizzle/` (generated: `pnpm --filter @pontis/api db:generate --name <name>`). Amounts and ratio parts are `numeric(39, 0)` and travel as strings.

## Tests

`pnpm --filter @pontis/api test` needs Postgres at `DATABASE_URL` (default `postgres://pontis:pontis@localhost:5432/pontis`). Each test file creates and drops its own database.
