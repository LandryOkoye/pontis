# Local setup

From a clean checkout to a running system, on your machine and then on NEAR Testnet. Testnet and synthetic assets only.

## Prerequisites

| Tool                           | For                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Node.js 22+ and pnpm           | Everything in TypeScript (the pnpm version is pinned by `packageManager`)                                  |
| Docker                         | Local PostgreSQL 16                                                                                        |
| Rust (`rust-toolchain.toml`)   | Contracts and the sandbox tests                                                                            |
| `cargo-near` **or** `wasm-opt` | Building the wasm: `cargo-near` for the default build, `binaryen`'s `wasm-opt` for `slim`                  |
| Foundry (`forge`, `anvil`)     | **Optional.** EVM contracts in `contracts-evm/` and the bridge e2e; not needed for Rust or TypeScript work |

## 1. Install and check

```bash
pnpm install --frozen-lockfile
POSTGRES_PORT=5432 pnpm db:up        # use another port if 5432 is taken, and set DATABASE_URL to match
export DATABASE_URL=postgres://pontis:pontis@localhost:5432/pontis
pnpm format:check && pnpm -r lint && pnpm -r typecheck && pnpm -r test
pnpm rust:fmt && pnpm rust:clippy && pnpm rust:test      # contract unit tests
```

Database tests create and drop a throwaway database each, so they can run in parallel and leave nothing behind.

## 2. Build the contracts

```bash
scripts/build-contracts.sh slim      # cargo build + wasm-opt; about half the size of the default build
# or: scripts/build-contracts.sh     # cargo-near
```

Output is `target/near/<crate>/<crate>.wasm`. The sandbox tests and the end-to-end run need it:

```bash
pnpm test:integration                # near-workspaces sandbox tests (downloads the sandbox binary once)
```

## 3. Run everything on a local chain

One command starts a sandbox, deploys and seeds the contracts, starts the API and the indexer on a throwaway database, and walks the whole product through it (see [`tests/e2e`](../tests/e2e)):

```bash
pnpm --filter @pontis/e2e e2e        # about three minutes after the first build; logs go to a temp directory, printed on failure
```

CI runs this same command in the `e2e` job on every pull request and push to `main`, on a sandbox with a `postgres:16` service; it never uses a public Testnet RPC. If that job fails, download its `e2e-logs` artifact (the API, indexer and sandbox logs) from the workflow run. To reproduce locally, build with `scripts/build-contracts.sh slim` first, as the job does.

## 4. Run the services by hand against Testnet

1. **Deploy and seed** (needs about 20 NEAR on the deployer; see [deployments](architecture/deployments.md)):

   ```bash
   cp scripts/.env.example scripts/.env          # DEPLOYER_ACCOUNT_ID and DEPLOYER_PRIVATE_KEY
   scripts/deploy-testnet.sh slim
   ```

   The seed prints a generated quote-signer key once. Keep it; it is the only copy.

2. **Configure the services.** Copy `apps/api/.env.example` and `apps/indexer/.env.example` to `.env` and set the contract account IDs, `QUOTE_SIGNER_SECRET_KEY` and `ADMIN_API_KEY`. `.env` files are ignored by git.

3. **Start them** (two terminals; both apply migrations on start):

   ```bash
   pnpm --filter @pontis/api start       # http://localhost:3000
   pnpm --filter @pontis/indexer start
   ```

4. **Check.** `curl localhost:3000/v1/health` should answer `ok` with a real `chainHeight`, `indexer.state` `running` and `indexerLagBlocks` settling at a few blocks. It reports `degraded` until the indexer has run, and again if the indexer stops ([health states](../apps/api/README.md#health)); `/v1/health/ready` is the same check as an HTTP status. `pnpm --filter @pontis/scripts ops status` prints the contract's state.

5. **Let users in.** Eligibility is an on-chain allowlist:

   ```bash
   pnpm --filter @pontis/scripts allowlist add all alice.testnet
   ```

   Test tokens come from the token's `faucet_mint` or the owner's `mint`.

## Seed the demo catalogue (optional)

On top of the MVP seed, the demo catalogue adds simulated issuers in different trust states, fictional claims, tokens and relationships. Everything is synthetic and the dossiers say so ([index](asset-dossiers/README.md)); the data is in [`scripts/lib/catalogue.ts`](../scripts/lib/catalogue.ts) (the four phase 1 issuers) and [`scripts/lib/catalogue-rich-*.ts`](../scripts/lib/) (the rich catalogue, [ADR 0019](decisions/0019-phase-3-scope-and-demo-issuers.md) section 3). It needs the MVP seed first (the quote signer).

Every token is a deployed contract account, so the catalogue comes in three sizes, `--catalogue=mvp|demo|full`. Estimates for the slim build (`pnpm --filter @pontis/scripts catalogue-plan` prints them; the NEAR and transaction counts follow from the plan, the times use assumed latencies and were not measured, and no deploy was run for them):

| Tier   | What it seeds                                                                                        | Token accounts | NEAR for the catalogue | Transactions | Time, testnet / sandbox (assumed) |
| ------ | ---------------------------------------------------------------------------------------------------- | -------------- | ---------------------- | ------------ | --------------------------------- |
| `mvp`  | Nothing beyond the MVP pair (`tgold-a`, `tgold-b`): what CI and the end-to-end suite use             | 0              | 0                      | 0            | none                              |
| `demo` | The phase 1 catalogue plus 18 rich tokens: 14 issuers, 17 claims, 10 relationships (**the default**) | 26             | about 74               | 369          | about 16 min / 4 min              |
| `full` | Everything: 19 issuers in 15 jurisdictions, 33 claims, 53 tokens, 22 relationships, every story      | 53             | about 152              | 712          | about 30 min / 8 min              |

Each token account is funded with 0.00001 NEAR per wasm byte plus 1 NEAR (2.80 NEAR for the 179,598-byte slim token), and the seed tops up `pontis-core` for the registry state (about 1 NEAR for `demo`, 2 for `full`). Testnet NEAR is free but rate-limited by its faucets; use `mvp` on a sandbox or in CI and `demo` or `full` where you want the market to look populated. A sandbox needs no NEAR.

```bash
pnpm --filter @pontis/scripts catalogue-plan                       # sizes and costs of every tier
pnpm --filter @pontis/scripts deploy-testnet --catalogue=demo      # also creates <representation id>.<deployer> token accounts (bare --catalogue means demo)
pnpm --filter @pontis/scripts seed-catalogue --catalogue=demo      # roles, issuers, claims, tokens, relationships, guards, supply, allowlist, vaults (default demo)
DATABASE_URL=postgres://pontis:pontis@localhost:5432/pontis \
  pnpm --filter @pontis/scripts seed-profiles --catalogue=demo     # off-chain asset_profiles; needs DEPLOYER_ACCOUNT_ID, no chain access
```

**One command for a local demo.** `pnpm demo:seed` deploys and seeds the MVP pair and the chosen tier, mirrors the registry into Postgres, writes the asset profiles and backfills the simulated market. Start a sandbox (`PONTIS_SANDBOX_INFO=/tmp/sandbox.json cargo test -p pontis-integration-tests --test serve_sandbox -- --ignored --nocapture`, as the end-to-end suite does), then:

```bash
DATABASE_URL=postgres://pontis:pontis@localhost:5432/pontis \
  pnpm demo:seed --catalogue=full --sandbox-info /tmp/sandbox.json   # --days 90 (default), --no-market to skip the database steps
```

Without `--sandbox-info` it targets the network in the environment, and a public testnet needs `--testnet` because the deploy spends NEAR. It prints the generated quote-signer key once; keep it. Keep passing the same `--catalogue` tier to every command (`deploy-testnet` without `--catalogue` rewrites the deployment record with the MVP rows only), and run the simulator after the registry sync, which `demo:seed` does for you.

**Fictional custody, reserves and redemption.** `demo:seed` also runs `seed-custody` for `demo` and `full` on a sandbox (`--no-custody` skips it; on a public testnet pass `--custody`): invented custodians, reserve policies with simulated attestations in different states (healthy, thin, breached, lapsing, warn-only, `pause_mint`, never attested), redemption terms and three simulated redemptions. By hand: `pnpm --filter @pontis/scripts seed-custody --catalogue=demo` after `seed-catalogue`. It is about 37 transactions for `demo` and 142 for `full` (estimates from the plan; `catalogue-plan` prints them, nothing was measured). Everything is simulated and nothing is custodied, backed or paid out; the stale story lapses within minutes by design ([runbook](runbooks/seed-demo.md#custody-reserves-and-redemption)).

Each step reads current state first, so repeating any of them is safe. `ALLOWLIST_ACCOUNTS` is allowlisted on every catalogue token as well. Run `seed-profiles` after the API has migrated the database; the profiles are keyed by representation ID and need no registry rows.

What a fresh chain ends up with from the phase 1 catalogue (the rich issuers are in the [dossier index](asset-dossiers/README.md#rich-demo-catalogue---catalogue-demo-and---catalogue-full)):

| Issuer               | Status       | `verification_status` | Tokens                                                  |
| -------------------- | ------------ | --------------------- | ------------------------------------------------------- |
| `halcyon-securities` | `active`     | `issuer_attested`     | `tacme-h`, `tustb-h`, `tvilla-1`, `tcredit-1`, `tusd-h` |
| `meridian-assets`    | `restricted` | `unverified`          | `tacme-m`, `tnova-m` (registered, cannot be activated)  |
| `orchard-trust`      | `deprecated` | `issuer_attested`     | `tustb-o` (active, not executable)                      |
| `vantage-credit`     | `rejected`   | `unverified`          | none                                                    |

Only `tustb-h` and `tustb-o` have an approved relationship (`DIRECT_EQUIVALENT`, 1 whole token each = 1 unit) and a funded vault (500,000 whole tokens each); `tacme-h` / `tacme-m` is proposed and cannot be approved while `tacme-m` is not active. `tvilla-1` has one token in total and no faucet. The contract is the authority for every status; why each was chosen is in the [limitations](known-limitations.md#demo-catalogue-trust-states-are-narrative).

## 5. Optional: a simulated market, or no chain at all

The charts, directory figures and market overview need price data, and a testnet has none. [`apps/simulator`](../apps/simulator/README.md) writes labelled, fake prices, NAV, supply and trade flow for the registered assets (it reads the registry mirror, so run the API sync first, and it needs `PONTIS_CORE_ACCOUNT_ID` in its `.env`: it signs each price for that contract):

```bash
pnpm --filter @pontis/simulator start backfill     # 90 days of history (timing per tier: the simulator README), safe to repeat
pnpm --filter @pontis/simulator start run          # keep it moving
```

The indexer also runs the market jobs (candles, stats, search) every minute, so with the indexer running the figures stay current. Everything simulated says so in the API.

To build a screen with no node, database or signer, run the API with `API_MODE=fixtures` ([frontend handoff](api/FRONTEND_HANDOFF.md)); it serves example data and marks every response `x-pontis-mode: fixtures`.

## RPC endpoints

`https://rpc.testnet.near.org` is deprecated and answers `429`. The examples use FastNEAR's free testnet endpoint, `https://test.rpc.fastnear.com`. Check what an endpoint serves before pointing anything at it: `https://free.rpc.fastnear.com` is **mainnet**, and the scripts refuse to send a transaction when the node's chain does not match `NEAR_NETWORK_ID`.

`NEAR_RPC_URL` has no default in the API and the indexer: they refuse to start without it. At startup both ask the node for its `status` before they touch the database, open a port or read a block, and exit with an error if the chain id does not match `NEAR_NETWORK_ID` (`testnet`, or a `test-chain...` id for `sandbox`), if the node cannot be reached, or if its answer has no chain id. On success they log the network id, chain id and the RPC URL reduced to scheme, host and port, so an API key in the URL never reaches a log or an error. The check runs once at startup; it does not watch for a node that later changes chain. The scripts default to the FastNEAR endpoint when `NEAR_RPC_URL` is unset on `testnet`.

A free endpoint is rate limited. One idle deployment (the indexer reading a block and a chunk per second, the reconciler, quoting) stays under it; a busy run (`E2E_MODE=testnet`) can exceed it, and then the indexer backs off and settlements arrive late, not lost. For anything beyond a demo use a keyed endpoint or your own node.

## Troubleshooting

| Symptom                                                                       | Cause                                                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Rate limits exceeded` or `429` in a log                                      | Public RPC limit: wait, or use a keyed endpoint (RPC endpoints above)                                          |
| `NEAR_NETWORK_ID is testnet but the RPC node serves the chain ...` at startup | `NEAR_RPC_URL` points at another network (for example mainnet): use the testnet endpoint (RPC endpoints above) |
| `Postgres is not reachable`                                                   | Container stopped or on another port: `docker start pontis-postgres`, or fix `DATABASE_URL`                    |
| `configured key ... is not a full-access key`                                 | `DEPLOYER_PRIVATE_KEY` belongs to another key of the account; the message lists the right public keys          |
| `missing ... .wasm`                                                           | Build the contracts first (step 2)                                                                             |
| Quotes are refused with `NOT_ELIGIBLE`                                        | The account is not on the allowlist (step 4.5)                                                                 |
| `indexerLagBlocks` null                                                       | The indexer has not run yet                                                                                    |
| `HistoryUnavailableError` in the indexer log                                  | See the [indexer operating notes](../apps/indexer/README.md)                                                   |
