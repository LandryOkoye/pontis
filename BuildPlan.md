# Pontis — Build Plan (MVP / Phase 0–1)

**Source of truth:** `ProjectBrief.md` (v2.0, 7 November 2026)
**Scope of this plan:** The brief's MVP (§18.1–18.2) and its first-milestone Definition of Done (§25): two synthetic NEP-141 representations of one synthetic claim, registered, assessed as `DIRECT_EQUIVALENT`, quoted, converted and reconciled on NEAR Testnet.
**Out of scope (do not build):** cross-chain bridges, market-priced exchange, dark pool / confidential execution, multi-solver markets, agent-initiated transactions, MCP write tools, lifecycle engine, protocol token, real RWAs or production funds.

---

## 1. Team and ownership

There are two workers. Each owns a set of paths and does not edit the other's paths.

| Worker | Owns | Git model |
|---|---|---|
| **Frontend worker (FE)** | `apps/web/**` only | One long-lived branch `feat/web-app` and **one PR** into `main`. The PR is merged remotely once it's done. |
| **Backend worker (BE)** (backend + smart contracts) | Everything else: `contracts/**`, `apps/api/**`, `apps/indexer/**`, `packages/**`, `scripts/**`, `docs/**`, root config, CI | **One branch per major feature or implementation.** Each branch becomes a PR into `main` (list in §6). |


Shared-file rules:
- `packages/api-types` is the API contract. **BE owns it.** FE imports it and never edits it. If FE needs a change, FE asks BE, BE ships it in a PR, and FE merges `main` into `feat/web-app`.
- FE adds dependencies only in `apps/web/package.json`. If `pnpm-lock.yaml` conflicts after merging `main`, accept `main`'s version and run `pnpm install` again. Don't hand-edit the lockfile.
- Root files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/**`) belong to BE. If FE needs a root change, BE makes it.

---

## 2. Technical decisions (fixed for the MVP)

These settle the open items in brief §23–24 so both workers can start right away. Any change needs a new ADR in `docs/decisions/`.

| Area | Decision |
|---|---|
| Repo | pnpm-workspace monorepo with a Cargo workspace for the contracts |
| Contracts | Rust, `near-sdk` (current stable), `near-contract-standards` for NEP-141, `cargo-near` to build, `near-workspaces` for sandbox integration tests |
| Contract layout | **Two contracts.** (1) `synthetic-token`: a NEP-141 token deployed twice (TGOLD-A, TGOLD-B). (2) `pontis-core`: one protocol contract whose internal modules cover issuers, assets, compatibility, policy, conversion and vault. This follows brief §13.1: don't split deployments until there's a security reason, and keep checks synchronous. |
| Backend | TypeScript, Node 22 LTS, Fastify, Zod schemas, OpenAPI generated from Zod |
| Database | PostgreSQL 16 using Drizzle ORM and migrations; local instance through `docker-compose` |
| Indexer | TypeScript worker that polls NEAR RPC for `pontis-core` receipts and parses NEP-297 `EVENT_JSON` logs. Its block cursor is stored in Postgres. |
| Frontend | React + TypeScript + Vite, TanStack Query, React Router, Tailwind, `@near-wallet-selector` (MyNearWallet + Meteor), MSW for mocks, Vitest + React Testing Library |
| Arithmetic | `u128` in contracts and `bigint` in TypeScript. Ratios are rational `{num, den}`. No floating point anywhere in amount math. |
| Quote binding | The backend signs every quote with an **ed25519 quote-signer key**. `pontis-core` stores that public key and verifies it with `env::ed25519_verify`. A quote is bound to user, pair, amounts, fee, expiry, nonce and the compatibility and policy versions. |
| Conversion execution | The user calls `ft_transfer_call` on the source token with receiver `pontis-core` and `msg` = `{quote, signature}`. `ft_on_transfer` validates and pays the output from the vault. If validation fails, the full amount is refunded. If the output transfer fails, a callback refunds the input. |
| Keys | The backend never holds user keys. It holds only the quote-signer key (in an env var, testnet only). Admin and registrar actions go through `scripts/` using NEAR CLI credentials. |
| Test tokens | `synthetic-token` has a testnet-only `faucet_mint` method with a per-call cap and a per-account cooldown, so demo users can fund themselves |

### 2.1 Synthetic claim and units (brief §6, §7.1)

- **Canonical claim `SYN-GOLD-OZ`:** a *synthetic, unbacked, test-only* claim to one troy ounce of fictional allocated gold. It's explicitly marked `synthetic: true, verified: false`.
- **TGOLD-A** (issuer "Synthetic Issuer A"): 6 decimals, 1 token = 1 canonical unit → multiplier per smallest unit = `1 / 10^6`.
- **TGOLD-B** (issuer "Synthetic Issuer B"): 8 decimals, 1 token = 0.1 canonical unit → multiplier per smallest unit = `1 / 10^9`.
- That gives an approved ratio of **1 A = 10 B**, which matches the brief's example. In smallest units: `out_B = in_A × 1000`.
- Fee: `protocol_fee_bps` (default 10 bps). `gross = floor(in × r_src / r_dst)`, `fee = ceil(gross × bps / 10_000)`, `net = gross − fee`. Invariant: `net ≤ gross`, and the result is never rounded in the user's favour beyond the ratio.

---

## 3. Repository structure

```text
pontis/
├── apps/
│   ├── web/                 # FE — React app (feat/web-app)
│   ├── api/                 # BE — Fastify REST API
│   └── indexer/             # BE — NEAR event indexer + reconciler
├── contracts/
│   ├── synthetic-token/     # BE — NEP-141 test token
│   └── pontis-core/         # BE — registry, compatibility, policy, conversion, vault
├── packages/
│   ├── domain/              # BE — shared domain types, rational math (bigint)
│   ├── api-types/           # BE — Zod schemas + generated openapi.yaml (FE consumes)
│   ├── near-client/         # BE — typed pontis-core / token RPC wrappers
│   └── quote-engine/        # BE — pure quote/fee calculation
├── docs/
│   ├── architecture/        # diagram, component overview
│   ├── decisions/           # ADRs
│   ├── asset-dossiers/      # SYN-GOLD-OZ, TGOLD-A, TGOLD-B dossiers
│   ├── threat-model/
│   └── runbooks/
├── scripts/                 # deploy, seed, allowlist, fund-vault, check-commit-size
├── tests/e2e/               # cross-component tests
├── .github/workflows/ci.yml
├── docker-compose.yml
├── Cargo.toml               # Cargo workspace
├── package.json / pnpm-workspace.yaml / tsconfig.base.json
├── ProjectBrief.md
├── BuildPlan.md
└── README.md
```

---

## 4. Git rules (both workers must follow these)

### 4.1 Commit size

- A normal commit must include at least **3 files** and at least **60 inserted lines**.
- Count inserted lines (`+` lines in the staged diff). Deletions don't count toward the 60-line minimum.
- If 3 files add fewer than 60 lines, include more relevant files until the commit reaches 60 insertions.
- Three files may exceed 60 insertions. Commits may also exceed 60 insertions when the changes belong together, up to a maximum of **250** inserted lines. A commit above 250 needs an explained exception in its message (`Exception to the 250 line cap: ...`).
- Keep each commit focused. Do not add unrelated files just to reach the minimum.
- Use fewer than 3 files only for a genuine exception, such as a narrowly scoped fix or documentation-only change that can't reasonably be grouped with related work. Explain the exception.

### 4.2 Commit messages

- Keep commit messages short and specific.
- Suggested form: `<area>: <what changed>`, e.g. `core: add compatibility registry with versioned history`, `web: quote preview with expiry countdown`.
- **Explaining an exception:** if a commit breaks the size rule, add one body line saying why, e.g. `Exception: single-file fix to fee rounding; no related changes pending.`

### 4.3 Checking size before every commit

Run this on the staged diff before committing (it's also shipped as `scripts/check-commit-size.sh`):

```bash
git diff --cached --numstat | awk '
  { files++; if ($1 != "-") ins += $1 }
  END {
    printf "%d files, %d insertions\n", files, ins
    if (files < 3 || ins < 60) { print "BELOW MINIMUM — add related work or document the exception"; exit 1 }
  }'
```

It's advisory. A genuine exception may go ahead as long as the commit message explains it.

### 4.4 Planning commits to satisfy the rule

- Group by **vertical slice**, not by file. For example, a contract module + its unit tests + its event definitions is one commit; an endpoint + its schema + its tests is one commit.
- Don't commit after every small edit. Stage a coherent unit of work, check it, then commit.
- Never pad a commit with unrelated files, generated noise, or whitespace churn.

### 4.5 Branches and PRs

- `main` is protected. **Nobody pushes to `main` after the bootstrap commit (§5).**
- Branch names: `feat/<name>`, `fix/<name>`, `chore/<name>`, `docs/<name>`.
- **BE:** create each branch from the latest `main`. Keep each PR to one major feature (§6) so it can be reviewed in one sitting. Open the PR when the feature's checklist is done and CI is green.
- **FE:** create `feat/web-app` from `main` once it has the scaffold (§5). Push it early and open a **draft PR** right away. Push regularly. Mark it ready for review when §7 is complete.
- **Staying current:** bring in new `main` work with `git merge main`. Don't rebase pushed branches; that avoids force-pushes onto open PRs. Merge commits don't count against the commit-size rule.
- **Merge method:** use **"Create a merge commit"**, not squash, so the rule-compliant commit history is kept on `main`. Delete the branch after it merges.
- **PR description** must include what changed, which brief sections it implements, how it was tested, and any known limitations.
- **Required before merge:** CI green, reviewed by the project owner, no edits to the other worker's paths.

---

## 5. Bootstrap (BE, once, directly on `main`)

`main` has no commits yet, so the first commit has to be made directly on it. After that, all work goes through PRs.

1. Create the GitHub repository `pontis`, add it as `origin`, and protect `main` (require PR + passing CI).
2. Bootstrap commit on `main`:
   - `ProjectBrief.md`, `BuildPlan.md`, `README.md` (project summary + where to find things)
   - `.gitignore` (Node, Rust `target/`, `.env*`, `.near-credentials`)
   - `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
   - `scripts/check-commit-size.sh`
   - Message: `chore: bootstrap pontis monorepo`
3. Push `main`. FE can now create `feat/web-app`.

---

## 6. Backend + contracts plan (BE): one branch and one PR per item

PRs will be created in this order. Items marked **⇢ FE** unblock frontend work.
You are not allowed to merge locally unless told to do so.

### B1 `chore/tooling-and-ci`
- Cargo workspace, `rust-toolchain.toml`, `cargo-near` build scripts.
- ESLint, Prettier and a shared TS config. `docker-compose.yml` with Postgres. `.env.example` for each app.
- `.github/workflows/ci.yml`: `cargo fmt --check`, `cargo clippy`, `cargo test`, `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, Postgres service for API tests.
- **Done when:** CI runs green on an empty workspace.

### B2 `phase0-decisions`
- ADRs: contract layout, quote-signing model, conversion via `ft_transfer_call`, admin roles, allowlist eligibility, synthetic evidence labelling, vault funding model (brief §24 items 1–8, 12–14).
- `docs/asset-dossiers/`: SYN-GOLD-OZ, TGOLD-A, TGOLD-B (§2.1 values).
- `docs/threat-model/mvp.md`: trust boundaries, admin keys, quote-signer compromise, replay, vault drain, stale compatibility.
- A list of what is deliberately mocked (brief §18.3 Phase 0).

### B3 `feat/api-contract` **⇢ FE (types + mocks)**
- `packages/domain`: entity types (brief §14.2 MVP subset), state enums, `Rational` and bigint helpers.
- `packages/api-types`: Zod schemas for every MVP endpoint (§8), a structured error schema, and generated `openapi.yaml`.
- Unit tests for rational math and schema round-trips.
- **Done when:** FE can `import` request and response types and build MSW mocks from them.

### B4 `feat/contract-synthetic-token`
- NEP-141 + metadata (`name` includes "SYNTHETIC TEST"), storage management, owner-only `mint`/`burn`, testnet `faucet_mint` (cap + cooldown, owner can disable), pause.
- Unit tests covering transfers, storage, faucet limits and unauthorized mint.

### B5 `feat/core-registry`
- `pontis-core` scaffold: roles (`owner`, `registrar`, `compat_approver`, `pauser`), global and per-asset pause, NEP-297 events.
- Issuer, canonical asset and token representation records (brief §6.2–6.4). Canonical claim and representation are kept as **separate entities**. Each record carries evidence references (URI + sha256 + provenance + timestamp) and a status (`active | restricted | paused | deprecated | rejected`).
- Rule: an incomplete record can't be set to `active` (brief §19.1).
- View methods for every record. Unit tests, including negative cases.

### B6 `feat/core-compatibility-policy`
- Compatibility relationships: classification (`DIRECT_EQUIVALENT | ECONOMICALLY_SIMILAR | INCOMPATIBLE | SUSPENDED`), rational ratio, scope, rationale, evidence refs, approver, `version`, and append-only history (brief §6.5–6.7).
- Lifecycle `proposed → approved/rejected → suspended`. Suspension takes effect immediately.
- Policy module: per-representation allowlist, `policy_version`.
- Events for every change. Tests verify that only `DIRECT_EQUIVALENT` + active + approved can be used for conversion.

### B7 `feat/core-conversion-vault`
- Vault: an operator funds inventory through `ft_transfer_call` with `msg: "fund_vault"`. Tracked per-representation inventory and owner withdrawal.
- `set_quote_signer(pubkey)` (owner). Fee config (`protocol_fee_bps`, capped).
- `ft_on_transfer` conversion path. It validates: signature, quote not expired, sender = `quote.user`, `amount == quote.amount_in`, compatibility version and policy version match current, both assets active and not paused, user allowlisted, recomputed output == `quote.amount_out`, inventory sufficient, and `quote.nonce` / `operation_id` not used before.
- Pays out with `ft_transfer` and a callback. If the payout fails, the callback refunds the input and emits `conversion_failed`. Emits `conversion_completed` with the full breakdown.
- Tests for all invariants in brief §13.4: property tests (proptest) for ratio and fee math, plus negative tests for expired, altered, replayed, suspended, paused, unauthorized and insufficient-inventory cases.

### B8 `feat/contract-integration-and-deploy`
- `near-workspaces` sandbox tests: deploy both tokens and core, register, approve, fund the vault, run a full conversion, plus the failure paths (payout failure refunds).
- `scripts/deploy-testnet.sh`, `scripts/seed-testnet.ts` (issuers, claim, two representations, `DIRECT_EQUIVALENT` relationship, quote-signer key, vault funding), `scripts/allowlist.ts`.
- Testnet account IDs recorded in `docs/architecture/deployments.md` and `.env.example`.
- **Done when:** a fresh testnet deploy + seed works from documented commands (brief §25).

### B9 `feat/api-db-and-catalog` **⇢ FE (live catalog)**
- Drizzle schema + migrations: `issuers`, `canonical_assets`, `asset_representations`, `asset_evidence`, `compatibility_relationships`, `compatibility_reviews`, `transfer_policies`, `quotes`, `conversions`, `settlement_events`, `audit_log`, `indexer_cursor`.
- `packages/near-client`: typed view and call wrappers for core and token.
- Registry sync job (chain → DB) plus the endpoints `GET /v1/issuers`, `/v1/issuers/{id}`, `/v1/assets`, `/v1/assets/{id}`, `/v1/assets/{id}/compatibility`, `GET /v1/health`.
- Integration tests against Postgres.

### B10 `feat/quote-engine` **⇢ FE (live quotes)**
- `packages/quote-engine`: pure functions that mirror the contract math exactly, with shared test vectors that the Rust tests also check.
- `POST /v1/routes/compare`, `POST /v1/quotes`, `GET /v1/quotes/{id}`.
- Quote flow: check compatibility → check eligibility (on-chain allowlist) → check inventory → compute → sign → persist (`QUOTED`, 60 s expiry). Each refusal returns a reason code (`NOT_DIRECT_EQUIVALENT`, `NOT_ELIGIBLE`, `INSUFFICIENT_INVENTORY`, `ASSET_PAUSED`, …).
- Quote states per brief §7.4. Background expiry sweep.

### B11 `feat/conversion-submission` **⇢ FE (live convert + history)**
- `POST /v1/conversions` (needs an `Idempotency-Key` header). It accepts a quote ID and returns the **unsigned transaction plan** for the wallet: `storage_deposit` on the destination token if needed, plus `ft_transfer_call` on the source token. It marks the quote `ACCEPTED`. The backend never signs for users.
- `POST /v1/conversions/{id}/submitted` takes the tx hash from the frontend and moves the quote to `SUBMITTED`.
- `GET /v1/transactions/{id}` and `GET /v1/transactions?account=` for history.

### B12 `feat/indexer`
- `apps/indexer`: polls blocks and parses `pontis-core` events. Processing is idempotent (unique by receipt ID + log index), the cursor is persisted, RPC calls retry with backoff, and it re-scans a finality window.
- Applies events to `conversions`, `settlement_events` and registry tables. Moves quotes `SUBMITTED → SETTLED / FAILED`.
- Tests: duplicate events, restart from cursor, RPC failures.

### B13 `feat/reconciler`
- Compares expected conversions to observed events and token balances, including vault inventory against on-chain balances.
- Flags mismatches and stuck `SUBMITTED` quotes as `REQUIRES_RECONCILIATION`, writes to the audit log, and exposes `GET /v1/admin/reconciliation` (admin auth).
- Tests use injected mismatches.

### B14 `feat/api-hardening`
- Rate limiting, admin API-key auth, structured errors everywhere, request validation, CORS for the web origin, logs scrubbed of sensitive data (brief §10.1, §14.3).
- Audit log for privileged actions. API authorization and rate-limit tests.

### B15 `docs/demo-and-runbooks` (after the FE PR merges)
- `tests/e2e/`: a script-driven end-to-end run on sandbox or testnet covering catalog → quote → convert → indexed → reconciled.
- `docs/architecture/overview.md` with a diagram, a local setup guide, a demo script, known limitations, and runbooks (expired quote, failed payout/refund, stuck submission, vault low, pause procedure).
- Checks every item in the Definition of Done (§10).

---

## 7. Frontend plan (FE): branch `feat/web-app`, one PR

FE starts right after bootstrap and works against **MSW mocks** until the matching BE items are merged. `VITE_API_MODE=mock|live` switches between them. The commits below are suggested groupings; each one must satisfy §4.1.

| # | Milestone | Content | Live after |
|---|---|---|---|
| F1 | Scaffold | Vite + React + TS + Tailwind + Router + TanStack Query, layout shell, env config, Vitest setup | — |
| F2 | API layer + mocks | Typed API client, MSW handlers and fixtures for every endpoint in §8 (mirroring brief §10.2), mock/live switch. Before B3 lands, write local types from §8; switch to `@pontis/api-types` once B3 merges. | B3 |
| F3 | Wallet | `@near-wallet-selector` connect/disconnect, account display, network guard (testnet only), TGOLD-A/B balances, "Get test tokens" button (`faucet_mint`) | B4/B8 |
| F4 | Asset catalog | List of representations: issuer, chain, symbol, underlying claim, unit, status, prominent **SYNTHETIC / UNVERIFIED** badges (brief §15.1) | B9 |
| F5 | Asset detail | Issuer, claim and representation shown as separate sections. Decimals and unit multiplier. Evidence list that separates *issuer-provided*, *third-party attested* and *independently verified* (brief §15.1 step 5). Admin capabilities (mint/pause/freeze). | B9 |
| F6 | Compare + compatibility | Pick two representations and show the classification, rationale, scope, ratio, version and approval history. Plain-language explanation of **why** a pair is or isn't directly convertible (brief §6.7). | B9 |
| F7 | Quote | Amount input (bigint-safe, decimal-aware), request quote, preview showing input, output, ratio, fee breakdown, network cost note, route ("controlled test vault, same-chain, asynchronous settlement with refund"), warnings, **live expiry countdown** with re-quote, and a distinct state for each refusal reason | B10 |
| F8 | Convert | Confirm screen → `POST /v1/conversions` → wallet signs the returned actions (storage deposit + `ft_transfer_call`) → report the tx hash → status page. Covers wallet rejection, tx failure and expired-before-sign. | B11 |
| F9 | Status + history | Transaction detail and history list for every state: `QUOTED, ACCEPTED, SUBMITTED, SETTLED, EXPIRED, REJECTED, FAILED, REQUIRES_RECONCILIATION`. Polling, explorer links, receipt view. | B11/B12 |
| F10 | Polish + tests | Empty, loading and error states, accessibility pass, responsive layout. RTL tests for catalog, detail, compatibility explanation, quote expiry, wallet rejection and each status state (brief §20.3). | — |
| F11 | Live integration | Switch to live mode against testnet, fix contract drift, update README section for `apps/web`, mark the PR ready | B12 |

FE rules:
- Never compute amounts with floats. Use `bigint` and the helpers from `packages/domain`.
- Never call something "verified" without saying what was checked, by whom and when (brief §16.1).
- Never call the conversion "bridge" or "exchange". It's a **parity conversion** of a synthetic test asset.

---

## 8. API contract summary (MVP)

BE formalises this in B3. FE can mock it from day one. All amounts are **strings of smallest units**, and all timestamps are ISO-8601 UTC.

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/health` | `{status, chainHeight, indexerLagBlocks}` |
| GET | `/v1/issuers`, `/v1/issuers/{id}` | Issuer record + evidence |
| GET | `/v1/assets`, `/v1/assets/{id}` | Representation + embedded canonical claim + issuer summary + `synthetic`, `status`, `decimals`, `unitMultiplier {num, den}` |
| GET | `/v1/assets/{id}/compatibility` | Relationships: `{counterpartId, classification, ratio {num, den}, scope, rationale, version, status, history[]}` |
| POST | `/v1/routes/compare` | `{fromId, toId, amount?}` → `{routes: [{type: "PARITY_CONVERSION", executable, reasonCode?}]}` |
| POST | `/v1/quotes` | `{fromId, toId, amountIn, accountId}` → `{id, amountIn, amountOutGross, fee, amountOut, ratio, feeBps, expiresAt, route, compatibilityVersion, policyVersion, warnings[], state}` or error `{code, message}` |
| GET | `/v1/quotes/{id}` | Quote + state |
| POST | `/v1/conversions` | Header `Idempotency-Key`. Body `{quoteId}` → `{conversionId, actions: [{receiverId, methodName, args, gas, deposit}]}` |
| POST | `/v1/conversions/{id}/submitted` | `{txHash}` |
| GET | `/v1/transactions/{id}`, `/v1/transactions?account=` | Conversion + quote + events + state + `txHash` + `failureReason?` |

Error codes: `VALIDATION_ERROR, NOT_FOUND, NOT_DIRECT_EQUIVALENT, RELATIONSHIP_SUSPENDED, ASSET_PAUSED, NOT_ELIGIBLE, INSUFFICIENT_INVENTORY, QUOTE_EXPIRED, QUOTE_ALREADY_USED, RATE_LIMITED, INTERNAL`.

---

## 9. Sequencing and parallel work

```text
main:  bootstrap ─┬─ B1 ─ B2 ─ B3 ─ B4 ─ B5 ─ B6 ─ B7 ─ B8 ─ B9 ─ B10 ─ B11 ─ B12 ─ B13 ─ B14 ──[FE PR merge]── B15
                  │               │                         │     │      │      │
feat/web-app:     └─ F1 ─ F2 ─────┴─ F3 ─ F4 ─ F5 ─ F6 ─────┴─ F7 ┴─ F8 ─┴─ F9 ─┴─ F10 ─ F11 ─► PR ready
                       (mocks)   (merge main: api-types)  (merge main: live endpoints as they land)
```

- FE merges `main` into `feat/web-app` after each **⇢ FE** PR (B3, B9, B10, B11, B12) and switches that area to live mode.
- B2 (docs) may be developed in parallel with B3–B4 if that helps; it doesn't block code.
- The FE PR merges after B14 and before B15, so B15's e2e test and demo cover the real UI.

---

## 10. Definition of Done (brief §25)

- [ ] The repo builds from a clean checkout with the documented commands.
- [ ] Contracts deploy to NEAR Testnet with environment-specific config.
- [ ] Two synthetic representations and one `DIRECT_EQUIVALENT` relationship are registered.
- [ ] The web app shows both assets and explains their synthetic status and unit definition.
- [ ] A user can request a quote and see the ratio, fees, expected output, expiry and warnings.
- [ ] A user can sign and execute a conversion.
- [ ] Output amounts match the configured ratio and fee rules (the shared Rust and TS test vectors pass).
- [ ] Unsupported, expired, suspended and unauthorized conversions are rejected, both on-chain and in the API.
- [ ] Transaction history and status reconcile with contract events.
- [ ] Automated tests cover normal, invalid and failure cases (contracts, API, indexer, web).
- [ ] The demo script, architecture diagram, known limitations and local setup guide are committed.

---

## 11. Guardrails (apply to every PR)

- Testnet and synthetic assets only. Nothing may claim real backing or verification.
- No floating-point amount math anywhere.
- No user signing keys in the backend. The quote-signer key lives only in env and never in git.
- Every state-changing contract method checks roles and pause state and emits an event.
- A route is executable only when both assets are active and the relationship is `DIRECT_EQUIVALENT` + approved, checked at **quote time and at execution time**.
- If a feature is listed as out of scope at the top of this plan, it doesn't get built. Put the idea in `docs/decisions/` instead.
