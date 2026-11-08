# @pontis/api

Fastify REST API for the Pontis MVP (testnet, synthetic assets only). This slice serves the catalog and health; quotes and conversions arrive with B10 and B11.

## Run locally

```bash
POSTGRES_PORT=5432 pnpm db:up            # Postgres 16 (set POSTGRES_PORT if 5432 is taken)
cp apps/api/.env.example apps/api/.env   # set PONTIS_CORE_ACCOUNT_ID after deploying (docs/architecture/deployments.md)
pnpm --filter @pontis/api start          # migrates, starts on :3000, syncs the registry every 15 s
```

`pnpm --filter @pontis/api sync` copies the on-chain registry into Postgres once and exits. The database is a cache of the chain: it can be dropped and rebuilt with `db:migrate` and `sync`.

## Endpoints

`GET /v1/health`, `/v1/issuers`, `/v1/issuers/{id}`, `/v1/assets`, `/v1/assets/{id}`, `/v1/assets/{id}/compatibility`. Paths and schemas come from `@pontis/api-types`, and each response is validated against its schema before it is sent. Errors are `{code, message, details?}`.

## Database

Drizzle schema in `src/db/schema/` (12 tables), migrations in `drizzle/` (generated: `pnpm --filter @pontis/api db:generate --name <name>`). Amounts and ratio parts are `numeric(39, 0)` and travel as strings.

## Tests

`pnpm --filter @pontis/api test` needs Postgres at `DATABASE_URL` (default `postgres://pontis:pontis@localhost:5432/pontis`). Each test file creates and drops its own database.
