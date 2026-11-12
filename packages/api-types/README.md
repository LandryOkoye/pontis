# @pontis/api-types

The Pontis REST API contract (BuildPlan §8). Owned by the backend worker; the frontend imports it and never edits it. To request a change, ask BE.

- `src/` Zod schemas for every MVP endpoint, the structured `ApiError`, and `ENDPOINTS` (method, path, status, request and response schemas, error codes per endpoint).
- `openapi.yaml` is generated from those schemas. Regenerate with `pnpm --filter @pontis/api-types generate`; a test fails if it is stale.
- `@pontis/api-types/fixtures` has deterministic example payloads for TGOLD-A, TGOLD-B and a quote. Build MSW handlers from these.

## Wire rules

- Amounts are decimal strings of **smallest units** (`"1000000"`), never JSON numbers. Parse with `parseAmount` / `parseDecimalAmount` from `@pontis/domain`.
- Ratios are `{num, den}` strings in lowest terms.
- Timestamps are ISO-8601 UTC (`...Z`).
- Errors are `{code, message, details?, retryAfterSeconds?}` with a stable `code`.

## Using it from the web app

```ts
import { QuoteSchema, ENDPOINTS, type Quote } from "@pontis/api-types";
import { quote } from "@pontis/api-types/fixtures";
import { parseDecimalAmount } from "@pontis/domain";

const amountIn = parseDecimalAmount("1.5", 6).toString(); // "1500000"
```

`Transaction.txHash` is the **verified** transaction hash and is null until the chain confirms the transaction is the conversion's; use it for explorer links. `reportedTxHash` is what the wallet reported (unchecked) and `txHashStatus` is `NONE`, `REPORTED`, `VERIFIED` or `REJECTED`. `POST /v1/conversions/{id}/submitted` answers `422 VALIDATION_ERROR` for a transaction that is not the conversion's.

Quote refusals (`NOT_DIRECT_EQUIVALENT`, `NOT_ELIGIBLE`, ...) are `422` responses with an `ApiError` body; `POST /v1/routes/compare` always returns `200` and reports refusal in `reasonCode`.
