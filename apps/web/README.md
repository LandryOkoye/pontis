# Pontis web (`apps/web`)

The Pontis frontend: a landing page and the app (registry, compatibility, signed quotes, parity
conversion, status and history, wallet and faucet, reconciliation).

> **Testnet and synthetic assets only.** The UI labels every record `SYNTHETIC` / `UNVERIFIED`,
> calls the operation a **parity conversion** (never a bridge, exchange or swap), and shows no
> number the protocol does not actually have.

## Run it

```bash
pnpm install
pnpm --filter @pontis/web dev        # http://localhost:5173
```

With no `.env.local` the app runs in **mock mode**: the API is served by MSW from the shared
`@pontis/api-types` fixtures and the wallet is simulated, so the whole flow works with no chain
and no backend. Pick `alice.testnet` (allowlisted) or `guest.testnet` (refused with
`NOT_ELIGIBLE`) when connecting.

To run against the real API and NEAR Testnet, copy `.env.example` to `.env.local` and set:

```bash
VITE_API_MODE=live
VITE_API_URL=http://localhost:3000
```

The API's `CORS_ORIGIN` must include the web origin. Live mode uses the NEAR wallet selector
(MyNearWallet and Meteor); the account must be on the testnet allowlist to get a quote.

## Commands

| Command                           | What it does                     |
| --------------------------------- | -------------------------------- |
| `pnpm --filter @pontis/web dev`   | Vite dev server                  |
| `pnpm --filter @pontis/web build` | Typecheck and production build   |
| `pnpm --filter @pontis/web test`  | Vitest + React Testing Library   |
| `pnpm --filter @pontis/web lint`  | ESLint (extends the root config) |

## Routes

| Path                  | Screen                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `/`                   | Landing page                                                          |
| `/app`                | Overview: registry stats, vault depth, compatibility matrix, activity |
| `/app/assets`         | Asset catalog                                                         |
| `/app/assets/:id`     | Asset detail: claim, representation, issuer, relationships, evidence  |
| `/app/issuers[/:id]`  | Issuers and issuer record                                             |
| `/app/compare`        | Compare two representations and explain the classification            |
| `/app/convert`        | Amount, signed quote with 60 s countdown, wallet signing              |
| `/app/activity[/:id]` | History, and one conversion's timeline, receipt and contract events   |
| `/app/wallet`         | Balances read from the token contracts, and the faucet                |
| `/app/reconciliation` | Operator report (admin key held in memory only)                       |

## Layout

```text
src/
  lib/         config, API client, query hooks, formatting (bigint only), copy
  wallet/      wallet adapter: NEAR wallet selector (live) and simulated wallet (mock)
  mocks/       MSW handlers and the in-memory mock database / chain
  components/  design system (ui/), labels, the Span visual, charts, shell
  pages/       one file per screen
  test/        test harness and suites
  styles/      design tokens and global styles (Tailwind v4 @theme)
```

## Notes

- Amounts are never converted to `Number`. Parsing and formatting use `@pontis/domain`.
- `@pontis/api-types` is imported for types only, so its Zod and OpenAPI runtime stays out of the
  bundle. Mocks import `@pontis/api-types/fixtures`.
- Mock mode adds two representations that are **not deployed** (`TGOLD-U`, `TSILV-A`) so the
  non-convertible compatibility classes can be shown. Live mode shows only what the API returns.
- A redirect wallet (MyNearWallet) leaves the page to sign; the result is picked up from the
  return URL and reported to the API (`src/wallet/redirect-return.tsx`).
