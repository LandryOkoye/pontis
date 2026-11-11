# Phase 4: session endpoints, reserve monitor read and indexer gaps

The session-authenticated half of [ADR 0020](../decisions/0020-custody-reserves-and-redemption.md) section 10, built on the NEP-413 session of [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md). Branch `feat/phase4-session`, stacked on `feat/phase4-indexer` (which holds `feat/phase4-api`). The Rust in `contracts/pontis-core/src` was read for method names, arguments and event payloads; no cargo build and no sandbox or testnet run was done, so nothing here has met a real contract. The web app, `tests/e2e` and `scripts` are untouched.

**The API signs and sends nothing.** Every endpoint below returns unsigned `WalletAction`s. A redemption in this demo pays nothing: tokens go into escrow, and the simulated issuer burns them or the user reclaims them.

## What changed

| Area        | Change                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain      | Error codes `STATE_CONFLICT` (409) and `MINT_REFUSED` (422).                                                                                                                                                                                                                                                                                                            |
| near-client | `redeemMsg` (the `redeem:{terms_hash}:{payout_instruction_hash}` message, refusing anything the contract's `parse_msg` would), unsigned action builders for `reclaim_redemption`, `accept`/`reject`/`fulfil_redemption`, `request_mint`, `execute_mint`; `CoreClient.getIssuer` and `getRepresentation`; `settling` on a redemption and `mint_paused` on mint headroom. |
| db          | Migration `0008`: `redemption_payout_instructions` (the encrypted instruction, stored unread, keyed by prepare id) and `redemption_refusals`.                                                                                                                                                                                                                           |
| api-types   | Ten operations (below), their schemas and fixtures, `openapi.yaml` regenerated.                                                                                                                                                                                                                                                                                         |
| API         | `src/custody`: `prepare`, `payout`, `reclaim`, `issuer-access`, `issuer-queue`, `issuer-intents`, `mint-queue`, `mint-intents`; `src/routes/redemptions.ts` and `issuer.ts`; `auth/authorize.ts` gained `authenticateRequest` and `auditSessionCall`; `auth/policy.ts` gained `SESSION_POLICY` and the `getReserveMonitor` admin policy.                                |
| indexer     | `redemption_refused` mirrored; a prepared payout instruction is linked to its redemption; open mint requests are read from the chain.                                                                                                                                                                                                                                   |
| docs        | Handoff (how the wallet signs the actions), known limitations, deliberately mocked, threat rows T100 to T105, redemption runbook, indexer README, ADR 0020 amendments.                                                                                                                                                                                                  |

## Endpoints

| Operation                                                       | Who (policy)                                                                  | Notes                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/redemptions/prepare`                                  | Any session; the session account is the redeemer                              | Validates against the chain's terms; stores the base64 ciphertext; returns `termsHash`, `payoutInstructionHash`, `msg`, one `ft_transfer_call`. `201`. |
| `POST /v1/redemptions/{id}/reclaim-intent`                      | The redemption's own account, else `403`                                      | `409 STATE_CONFLICT` unless reclaimable (rejected, expired, past a deadline) and not `settling`.                                                       |
| `GET /v1/issuer/redemptions`                                    | An account of an issuer's `controlled_accounts`, or an operator               | Merged newest-first queue with an id cursor; payout instructions never appear.                                                                         |
| `POST /v1/issuer/redemptions/{id}/accept`, `/reject`, `/fulfil` | An account of the redemption's active issuer (chain read)                     | The contract's status, deadline and `settling` rules; `409 STATE_CONFLICT` otherwise. An operator gets `403`.                                          |
| `GET`, `POST /v1/issuer/mint-requests`, `POST .../{id}/execute` | As above                                                                      | `execute` pre-checks active asset, a reserve policy, `mint_paused` and `amount <= headroom` (`422 MINT_REFUSED`).                                      |
| `GET /v1/admin/reserve-monitor`                                 | Operator roles, sensitive (roles re-read from the chain), like reconciliation | The stored monitor pass; `NEVER_RUN`, `OK` or `ATTENTION`.                                                                                             |

## Decisions and judgement calls

- **Issuer authority is the contract's own rule.** `accept_redemption`, `request_mint` and the rest require the caller to be in `controlled_accounts` of the representation's _active_ issuer; no role is involved. The ADR's "role set or `controlled_accounts`" is read as: controlled accounts act; operator roles (owner, registrar, compat_approver, pauser) may _read_ queues, because an unsigned action for them would fail on chain. The break-glass key is not accepted on session endpoints.
- **`prepare` takes an optional `termsHash`.** The ADR body has no way to detect `REDEMPTION_TERMS_CHANGED` otherwise: the API always uses the current hash in the message. If the client supplies the hash it displayed and it differs, the API refuses before signing. Without it only the contract checks.
- **The payout instruction is base64 ciphertext, hashed over the decoded bytes.** The Rust only checks that the hash is 64 lowercase hex characters and never hashes anything, so the hash rule is fixed here: SHA-256 of the decoded ciphertext (canonical base64, 1 to 4,096 bytes). Pinned by a vector computed with Python `hashlib` (`bytes(range(32))`, `b"\xff"`). The message builder is tested against the grammar cases of `test-vectors/redemption-terms.json`.
- **Nothing reads the instruction back.** Not the API, not the issuer endpoints, not the audit log (which holds the hash). The indexer links a stored row to its redemption by account and hash without reading it.
- **Refusals are `409` for `REDEMPTION_*`** (the ADR's status, unlike quote refusals which are `422`), `422 ASSET_PAUSED` for a paused or deprecated asset, and `404` for an asset with no enforced terms. A restricted asset can be redeemed, as in the contract.
- **Two new error codes** instead of overloading existing ones: `STATE_CONFLICT` and `MINT_REFUSED`.
- **Queues scan the chain, bounded.** The contract lists by representation, so each queue read scans the newest 500 requests of each readable asset and merges by id. A rare status beyond 500 per asset can be missed; documented.
- **Audit.** Every allowed session call writes an `audit_log` row (`session.*`, `issuer.*`), a refused issuer action writes `session.issuer.forbidden`. No row holds a payout instruction.

## Indexer gaps found reading the Rust against `apps/indexer`

Fixed here:

1. **`redemption_refused` was not mirrored** (it was only in `settlement_events`). Now `redemption_refusals`, with the contract's reason (`UNKNOWN_TOKEN`, `INVALID_MSG`, `PAUSED`, `ASSET_NOT_REDEEMABLE`, `TERMS_MISSING`, `TERMS_CHANGED`, `BELOW_MIN`, `ABOVE_MAX`, `WINDOW_CLOSED`, `TOO_MANY_OPEN`; an unknown reason is reported unreadable, not guessed).
2. **`minting` was never seen** and a missed `mint_completed` or `mint_failed` left a request `requested` forever. The Rust emits `mint_completed` and `mint_failed` (confirmed; the appliers already handled them) but `execute_mint` emits nothing, so each pass now reads `get_mint_request` for open requests and moves the row to the chain's status.
3. **`ChainRedemption` lacked `settling`** and **`get_mint_headroom` lacked `mint_paused`** in near-client (the ADR amendments add both). Both are now required fields.

Found, not fixed (listed for the main agent):

- No reconciler rule for a mint request stuck in `minting`, or for `pending_mint` that never clears; a callback always runs on chain, so this is a defensive gap only.
- `mint_completed` and `redemption_fulfilled` carry `circulating_units` and `headroom_units` that the mirror drops.
- `role_granted`, `role_revoked` and the ownership events are not mirrored; the API reads roles from the chain.
- Redemption timeline rows still have no `txHash` (receipts do not name their transaction).
- The API still reads history from chain views, not the mirror tables, so `redemption_events` and `reserve_attestations` beyond 500 are unserved.
- An issuer's `controlled_accounts` is set only at `register_issuer`; there is no method to add a back-office account to a seeded issuer.
- `reserve_status_changed.to_state` can never be `unmonitored` today (there is no method to remove a policy), so the mirror's enum leaves it out; a contract change that adds one would be reported unreadable.

## Verification

`tsc --noEmit` and `eslint` are clean in `packages/domain`, `packages/near-client`, `packages/api-types`, `packages/db`, `apps/api` and `apps/indexer`. Vitest, each suite run alone against Postgres on port 5439: domain 62, near-client 94, api-types 121, db 12, `apps/api` 442 (64 files), `apps/indexer` 154 (28 files). `prettier --check .` is clean. No contract, sandbox end-to-end or testnet run, and no cargo build.

## Not done

- No end-to-end run of the wallet signing an action and the contract executing it (`tests/e2e` is another agent's).
- Prepared payout instructions that never become a redemption are not purged.
- Operators cannot act as an issuer, by design; there is no "act for an issuer" role.
