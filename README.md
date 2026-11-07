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

| Document | Purpose |
|---|---|
| [`ProjectBrief.md`](ProjectBrief.md) | Product and protocol source of truth (v2.0) |
| [`BuildPlan.md`](BuildPlan.md) | MVP build plan: ownership, technical decisions, git rules, work items, Definition of Done |
| `docs/` | Architecture, ADRs (`decisions/`), asset dossiers, threat model, runbooks (added as work lands) |

## Planned layout

```text
apps/web/            React frontend
apps/api/            Fastify REST API
apps/indexer/        NEAR event indexer and reconciler
contracts/           Rust: synthetic-token (NEP-141) and pontis-core
packages/            domain, api-types, near-client, quote-engine
scripts/             deploy, seed, allowlist, fund-vault, check-commit-size
tests/e2e/           cross-component tests
docs/                architecture, decisions, dossiers, threat model, runbooks
```

## Prerequisites

- Node.js 22 LTS or newer
- pnpm (version pinned by `packageManager` in `package.json`)
- Rust toolchain and `cargo-near` (contracts)
- Docker (local PostgreSQL 16)

Full setup and demo instructions are added with the tooling and docs PRs (`BuildPlan.md` §6, B1 and B15).

## Contributing

Work lands through pull requests into `main`; see `BuildPlan.md` §4 for commit-size, message and branch rules. Before committing, check the staged diff:

```bash
pnpm check:commit-size
```
