# Deployments

**Status: not deployed yet.** The deploy script overwrites this file with the real account IDs and wasm hashes after the first testnet deployment. Testnet and synthetic assets only.

## Account naming

Contracts live on sub-accounts of the deployer (`DEPLOYER_ACCOUNT_ID`), which is also the owner and holds every role:

| Contract                    | Account                          | Default env var          |
| --------------------------- | -------------------------------- | ------------------------ |
| `pontis-core`               | `pontis-core.<deployer>.testnet` | `PONTIS_CORE_ACCOUNT_ID` |
| `synthetic-token` (TGOLD-A) | `tgold-a.<deployer>.testnet`     | `TGOLD_A_ACCOUNT_ID`     |
| `synthetic-token` (TGOLD-B) | `tgold-b.<deployer>.testnet`     | `TGOLD_B_ACCOUNT_ID`     |

## Fresh deploy and seed

Prerequisites: a funded testnet account, Node 22 and pnpm, and either `cargo-near` or `wasm-opt` (binaryen). Each contract account is funded with 0.01 NEAR per byte of its wasm plus 1 NEAR: about 14 NEAR in total with the slim build (core 403 KB, tokens 180 KB each) and about 29 NEAR with the unoptimised build, plus the deployer's gas. Keep at least 20 NEAR on the deployer for a slim build.

```bash
pnpm install
cp scripts/.env.example scripts/.env     # set DEPLOYER_ACCOUNT_ID and DEPLOYER_PRIVATE_KEY
scripts/deploy-testnet.sh                # build, create sub-accounts, deploy, init, seed
```

`scripts/deploy-testnet.sh [slim]` runs three steps you can also run alone:

```bash
scripts/build-contracts.sh slim              # wasm into target/near/<crate>/<crate>.wasm; cargo build + wasm-opt, halves the size
scripts/build-contracts.sh                   # the same with cargo-near instead
pnpm --filter @pontis/scripts deploy-testnet # create accounts, deploy, init; writes this file
pnpm --filter @pontis/scripts seed           # roles, registry, relationship, signer, allowlist, vault
```

Every step reads current state first, so re-running is safe. The seed prints a generated quote-signer secret key once; put it in `apps/api/.env` as `QUOTE_SIGNER_SECRET_KEY` and never commit it.

Add or remove demo users (operator commands for pausing, funding and status are in the [runbooks](../runbooks/README.md)):

```bash
pnpm --filter @pontis/scripts allowlist add all alice.testnet bob.testnet
```

## Gas

A conversion `ft_transfer_call` completes with 40 Tgas in the sandbox and burns about 10 Tgas in total; with 33 Tgas or less it does not complete and the input is not lost (see the test). The wallet plan returned by the API attaches 100 Tgas. Measurements: `contracts/integration-tests/tests/gas.rs`.
