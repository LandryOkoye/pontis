# End-to-end run

One script that brings up a chain, the contracts, a database, the API and the indexer, and walks the product through them: catalog, quote, convert, index, refuse, reconcile.

```bash
scripts/build-contracts.sh slim              # once: the wasm the run deploys
export DATABASE_URL=postgres://pontis:pontis@localhost:5432/pontis
pnpm --filter @pontis/e2e e2e                # about three minutes after the first build
```

It deploys to a fresh sandbox and writes nothing to the repository (the deployment record goes to a temp directory). It creates and drops its own database, stops what it started, and on failure prints where the API, indexer and sandbox logs are. `E2E_MODE=testnet` runs against the deployment in the environment instead; see `.env.example`.

| Section        | What it proves                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog        | Both assets are listed, synthetic, unverified, with unit definitions; the pair is an approved `DIRECT_EQUIVALENT` and executable                                                                                                     |
| Conversion     | The quote equals the shared bigint math; accepting is idempotent; a signed transfer settles through the indexer; balances move by exactly the quoted amounts; replay is refused                                                      |
| Refusals       | Not allowlisted, no relationship, malformed input, a suspended pair (API and contract), an expired quote (API and contract)                                                                                                          |
| Reconciliation | Admin endpoint needs the key; vault inventory equals held tokens; a direct transfer and a stuck submission are reported                                                                                                              |
| Wallet sign-in | Sandbox only: the deployer signs a NEP-413 challenge and holds the owner role; `/v1/auth/me`; an admin endpoint answers the session and refuses a call without it; an account with no role is refused (403); logout ends the session |

## In CI

The `e2e` job in `.github/workflows/ci.yml` runs this same command on every pull request and every push to `main`, so a green workflow means the contracts, API, database and indexer worked together end to end, not only that each package passed its own tests.

- **Chain:** a local sandbox started by the run (`contracts/integration-tests/tests/serve_sandbox.rs`). CI never calls a public Testnet RPC, so rate limits cannot fail it.
- **Contracts:** built with `scripts/build-contracts.sh slim` after installing `wasm-opt` from a pinned `binaryen` npm package.
- **Database:** the job's `postgres:16` service; the run creates and drops its own database and stops the API, indexer and sandbox it started.
- **Failure:** any failed step exits non-zero and fails the job. The API, indexer and sandbox logs of a failed run are uploaded as the `e2e-logs` artifact (kept 7 days).
- **Not covered:** `E2E_MODE=testnet` (a real deployment) stays a manual, operator-run check because it depends on the shared public RPC.
