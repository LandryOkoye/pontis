# ADR 0013: API hardening

- **Status:** Accepted
- **Date:** 2026-11-09
- **Brief items:** §10.1, §14.3
- **Related:** [0006](0006-quote-signing-model.md), [0012](0012-reconciliation.md)

## Context

The API signs quotes with a key it holds, accepts writes from the open internet, and serves one privileged endpoint. Brief §10.1 asks for authenticated, rate-limited privileged endpoints, structured errors and audit logs that do not over-collect; §14.3 asks that keys and personal data stay out of logs.

## Decisions

1. **Rate limits by class, per client address.** Reads 120, writes (any non-`GET`) 30 and `/v1/admin` 10 requests per minute, each class counted separately so heavy reading cannot use up the write allowance. An excess request gets `429 RATE_LIMITED` with `Retry-After`. The admin class is the tightest because a refused request there is a guess at the key. Behind a reverse proxy set `TRUST_PROXY=true`, otherwise every client shares the proxy's address.
2. **CORS to the web origin only.** `CORS_ORIGIN` lists exact origins (no wildcard, no path). Allowed methods are `GET`, `POST` and `OPTIONS`; allowed request headers are `content-type`, `idempotency-key` and `authorization`; the rate-limit headers are exposed to the browser.
3. **Admin access.** `Authorization: Bearer <ADMIN_API_KEY>`, at least 16 characters, compared in constant time; unset closes the endpoints. Every call writes an `audit_log` row: authorized ones under `admin:<first 8 hex of sha256(key)>`, refused ones as `anonymous`. Neither the key nor the caller's address is stored. Admin answers carry `Cache-Control: no-store`.
4. **Logs.** Request lines carry the method and the path without the query string; no headers or bodies are logged. Error text and stacks pass through a scrubber that removes ed25519 keys, bearer tokens and credentials in connection strings. Pino redaction of `authorization`, `cookie` and `idempotency-key` is a backstop.
5. **Limits and headers.** Request bodies are capped at 16 KiB. Every response carries `X-Content-Type-Options: nosniff`.
6. **Errors.** Every non-2xx answer is the structured `ApiError`, including the 401 and 429 added here.

## Consequences

- One shared admin key means audit rows distinguish keys, not people. Per-admin identity is out of scope for the testnet MVP.
- Counters live in the API process. Several API instances would each allow the full rate; a shared store would be needed before running more than one.
- A flood of refused admin calls writes one audit row each, bounded by the admin limit per address.

## Verification

- `apps/api/test/rate-limit.test.ts`: the 429 body and header, separate counters per client and class, and a correct admin key refused once the guesses used up the admin allowance.
- `apps/api/test/cors.test.ts`: the web origin allowed, other origins given nothing, the conversion preflight, `nosniff` on every answer and `no-store` on admin ones.
- `apps/api/test/logging.test.ts`: a failing request carrying every secret leaves none of them in the log.
- `apps/api/test/admin-audit.test.ts`: refused and authorized calls are audited without the key or the address.
