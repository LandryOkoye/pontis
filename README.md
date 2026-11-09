# Pontis

A NEAR-based interoperability and settlement protocol for tokenized real-world assets (RWAs). It helps compatible representations of the same claim be discovered, evaluated, quoted and converted, without inferring equivalence from tickers, prices or unit multipliers.

> **Testnet and synthetic assets only.** Nothing in this repository claims real backing, custody or verification. The MVP uses fictional, unbacked test tokens.

## MVP scope

Two synthetic NEP-141 representations of one synthetic claim (`SYN-GOLD-OZ`) on NEAR Testnet:

- registered with their issuers and evidence,
- assessed as `DIRECT_EQUIVALENT` by an approved compatibility relationship,
- quoted by the backend (ed25519-signed, 60 s expiry),
- converted atomically from a controlled vault via `ft_transfer_call`,
- indexed and reconciled against contract events.

This is a **parity conversion** of a synthetic test asset. It is not a bridge and not an exchange.

Out of scope for the MVP: cross-chain bridges, market-priced exchange, dark pool / confidential execution, multi-solver markets, agent-initiated transactions, MCP write tools, lifecycle engine, protocol token, real RWAs or production funds.

## Where to find things

| Document                                                         | Purpose                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`ProjectBrief.md`](ProjectBrief.md)                             | Product and protocol source of truth (v2.0)                                               |
| [`BuildPlan.md`](BuildPlan.md)                                   | MVP build plan: ownership, technical decisions, git rules, work items, Definition of Done |
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | Components, diagrams, the conversion flow and quote lifecycle, trust boundaries           |
| [`docs/local-setup.md`](docs/local-setup.md)                     | Clean checkout to a running system, locally and on Testnet                                |
| [`docs/demo-script.md`](docs/demo-script.md)                     | A ten-minute walkthrough                                                                  |
| [`docs/runbooks/`](docs/runbooks/README.md)                      | Expired quote, failed payout, stuck submission, vault low, pause                          |
| [`docs/known-limitations.md`](docs/known-limitations.md)         | What the MVP does not do                                                                  |
| [`docs/definition-of-done.md`](docs/definition-of-done.md)       | Each Definition of Done item with its evidence                                            |
| [`docs/decisions/`](docs/decisions/README.md)                    | ADRs 0001 to 0013                                                                         |
| [`docs/threat-model/mvp.md`](docs/threat-model/mvp.md)           | Threats, mitigations and accepted limitations                                             |

## Layout

```text
apps/api/            Fastify REST API
apps/indexer/        NEAR event indexer and reconciler
apps/web/            React frontend (separate branch and pull request)
contracts/           Rust: synthetic-token (NEP-141) and pontis-core
packages/            domain, api-types, db, near-client, quote-engine
scripts/             deploy, seed, allowlist, ops (operator commands), check-commit-size
tests/e2e/           script-driven end-to-end run on a local sandbox or Testnet
docs/                architecture, decisions, dossiers, threat model, runbooks
```

Run the whole product end to end on a local chain with `pnpm --filter @pontis/e2e e2e` (see [local setup](docs/local-setup.md)).

## Prerequisites

- Node.js 22 LTS or newer
- pnpm (version pinned by `packageManager` in `package.json`)
- Rust toolchain and `cargo-near` (contracts)
- Docker (local PostgreSQL 16)

## Development commands

```bash
pnpm install                 # install workspace dependencies
pnpm db:up                   # start local PostgreSQL 16 (docker compose); pnpm db:down to stop
pnpm format:check            # Prettier (pnpm format to fix)
pnpm -r lint                 # ESLint in every workspace package (shared root eslint.config.mjs)
pnpm -r typecheck            # tsc in every workspace package (extend tsconfig.base.json)
pnpm -r test                 # tests in every workspace package
pnpm rust:fmt                # cargo fmt --check  (also: rust:clippy, rust:test)
pnpm build:contracts         # cargo-near build of every contract (cargo install cargo-near --locked)
```

The Rust toolchain is pinned in `rust-toolchain.toml`. Each app has an `.env.example`; copy it to `.env` (never committed). CI (`.github/workflows/ci.yml`) runs the same commands. Setup steps are in [`docs/local-setup.md`](docs/local-setup.md).

## Testnet deployment

Contracts deploy to NEAR Testnet from `scripts/`: `scripts/deploy-testnet.sh` builds, deploys and seeds; `pnpm --filter @pontis/scripts allowlist add all <account>` manages demo users. Account naming, prerequisites, gas figures and every command are in [`docs/architecture/deployments.md`](docs/architecture/deployments.md). The sandbox tests that exercise the real token flow run with `pnpm test:integration`.

## Contributing

Work lands through pull requests into `main`; see `BuildPlan.md` §4 for commit-size, message and branch rules. Before committing, check the staged diff:

```bash
pnpm check:commit-size
```

## License

MIT, see [`LICENSE`](LICENSE).
