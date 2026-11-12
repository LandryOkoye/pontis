# Phase 4: the end-to-end proof

Branch `feat/phase4-e2e`, stacked on `feat/phase4-indexer` (which contains `feat/phase4-api`). Until now the contract, the indexer and the API of Phase 4 had each been tested alone; nothing ran them together. The `custody` scenario of `tests/e2e` does, on a local sandbox, in about 100 seconds on top of the existing run (the whole run took 266 to 279 seconds). **Everything in it is simulated**: the custodian signs with the public dev reserve-attester key, the issuer back-office is an account of a demo issuer, and a redemption pays nothing.

## What the scenario drives

It talks to the chain directly with the wallet helper and the code behind `scripts reserves` and `scripts backoffice` (the session endpoints of the API are built elsewhere and are not used). It reads the API, the indexer's database and the reconciler's report to check that all three agree with the contract.

| Step                          | What is asserted                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set-up                        | Role `reserve_attester` granted, dev signer key added with scope `reserves`, custodian `vault-co-sim` registered and linked to `tgold-a` (segregated), policy `restrict_conversions` with 100 bps tolerance and 5 minutes of freshness, the core made the token's minter. The owner `mint` then fails.  |
| Attestation at 110 percent    | The API shows `state: ok`, ratio 10 999 to 11 000 bps, `freshness: fresh`, `simulated: true`, source `simulated_custodian`; history and the mirror's `reserve_attestations` hold it with the same figure.                                                                                               |
| Mint                          | `request_mint` and `execute_mint` as the issuer account mint half the headroom (balance, supply and headroom move by exactly that); a mint one unit above the headroom is refused and balance, supply, headroom and the request's state (`requested`) are unchanged; the request is then cancelled.     |
| Drift to 90 percent           | State `breached`; quotes answer 422 `RESERVE_RESTRICTED`; the guard breakdown's `reserves` check fails with that reason code; the mirror records `breached`; the reconciler reports no `RESERVE_BREACH` because the mirror knows.                                                                       |
| A breach the mirror missed    | The mirror row is set to `ok` in the throwaway database (a simulated missed event); the reconciler then reports `RESERVE_BREACH` (critical, "simulated reserves") for `tgold-a`. The row is restored.                                                                                                   |
| Recovery                      | Drift cleared and a fresh attestation at full cover: state `ok`, a quote succeeds again (after fresh simulated prices), the mirror is `ok`, the finding is gone.                                                                                                                                        |
| Redemption terms              | Terms set (min 1 000 000, fee 25 bps, always open, accept within 25 s, 1 settlement day); the API's `termsHash` equals the contract's and the mirror's.                                                                                                                                                 |
| A message quoting other terms | Refused, the tokens come back, no redemption exists.                                                                                                                                                                                                                                                    |
| Redeem                        | `ft_transfer_call` with `redeem:{terms_hash}:{payout_instruction_hash}`: the whole 2 000 000 is escrowed (user down, core up, ledger `held == open_amount`), fee 5 000 and net 1 995 000 are figures only, and the API shows `requested` and the payout hash.                                           |
| Fulfilment                    | The back-office code accepts then fulfils; the escrow is burned out of supply, the user gets nothing back, the core holds what it held before, the ledger reads in 2 000 000 = burned 2 000 000; the API timeline is requested, accepted, fulfilled with an evidence hash; the mirror says `fulfilled`. |
| Expiry                        | A second redemption (1 500 000) is ignored by the back-office, passes its accept deadline and is expired by a permissionless call (`miss: accept`); the API says `expired`, `reclaimable: true`.                                                                                                        |
| Reclaim                       | The user's `reclaim_redemption` returns the escrow; ledger in 3 500 000 = burned 2 000 000 + returned 1 500 000, nothing held; timeline requested, expired, reclaimed.                                                                                                                                  |
| API, mirror and reliability   | Both redemptions resolved in the mirror; the issuer's counters are requested 2, accepted 1, fulfilled 1, expired 1, accept misses 1, fulfil misses 0, reclaimed 1; the user's list is newest first.                                                                                                     |
| Reconciler                    | No `ESCROW_MISMATCH`, `REDEMPTION_OVERDUE` or `RESERVE_BREACH`, and the core's surplus over its books on `tgold-a` equals what it was before (see below).                                                                                                                                               |

## Choices

- **Short terms.** The accept deadline is 25 seconds, so the second redemption expires inside the run. The fulfil deadline is `settlement_days` (1 to 30) after acceptance and cannot be shortened, so it is not exercised on a chain; contract unit tests cover it. Policy freshness is 5 minutes (the contract minimum is 1) and the run publishes again before it matters.
- **The back-office account is the token account.** An issuer's `controlled_accounts` cannot change after registration and the seed lists only the token account, so the run signs as `tgold-a.<deployer>` with the deployer key, which `deploy-testnet` put on it. The runbook now says so.
- **The escrow check reads the vault's surplus.** The earlier reconciliation scenario deliberately leaves 1 234 `tgold-a` units untracked in the core, so that vault is always flagged and `ESCROW_MISMATCH` skips a flagged representation. A "no finding" assertion alone would pass vacuously, so the last step also asserts that `balance - inventory` (inventory includes the escrow books) is exactly what it was before the first redemption, through an escrow, a burn, an expiry and a return.
- **A breach the mirror knows is not a finding.** That is the indexer's design; the scenario proves it both ways, once with the mirror informed (no finding) and once with the mirror's row set back to `ok` (finding).
- **Assertions are on state, not panic text.** A refused mint is a wasm trap; the scenario asserts the request, balances, supply and headroom did not change.

## Found on the way

- The existing expiry scenario raced the API's quote sweep (default every 10 s): the indexer could mark the late quote `FAILED` before the sweep marked it `EXPIRED`. The run now sets `QUOTE_SWEEP_INTERVAL_MS=1000`. No API change.
- Nothing in `apps/*`, `packages/*` or the contract needed changing; no bug in them showed up.

## Running it

```bash
mkdir -p target && cp -r <a checkout with built wasm>/target/near target/near
E2E_SANDBOX_BIN=<path to a built serve_sandbox test binary> \
DATABASE_URL=postgres://pontis:pontis@localhost:5439/pontis pnpm --filter @pontis/e2e e2e
```

`E2E_SANDBOX_BIN` is optional: without it the run starts the sandbox with `cargo test`, as before. The drift state of the simulated custodian goes to a file in the run's log directory, not to `scripts/.reserves-state.json`.

## Verification

The full run passed twice with the scenario (266 s and 279 s; 14 custody steps, 39 steps in all). `tsc --noEmit` and `eslint` are clean in `tests/e2e` and `scripts`; `prettier --check` is clean on the changed files. Not run: `E2E_MODE=testnet` (the scenario is sandbox only), the session endpoints, and the CI job itself.
