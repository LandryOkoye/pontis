# What is deliberately mocked or simplified in the MVP

Phase 0 deliverable (brief §18.3): an explicit list of what the testnet MVP fakes, simplifies or leaves out, so nobody mistakes a demo shortcut for a production feature.

| Area | What the MVP does | What production would need |
|---|---|---|
| Underlying asset | `SYN-GOLD-OZ` is a fictional, unbacked claim ([dossier](../asset-dossiers/SYN-GOLD-OZ.md)) | A real, legally defined claim |
| Issuers | Two fictional issuers, both operated by the project | Real issuers, issuer-controlled contracts, adapters |
| Custody and backing | None | Custodian, attestations, redemption path |
| Evidence | Self-attested dossiers (`issuer_provided`, `unverified`) | Third-party and independent verification with scope, reviewer and date |
| Compatibility review | One relationship, approved by the project operator | Documented review against brief §6.6 by a designated authority, separated proposer/approver |
| Eligibility | On-chain allowlist, not KYC | KYC/KYB, sanctions, jurisdiction and lockup checks via issuer adapters |
| Pricing | Fixed approved unit ratio plus a flat fee | Market pricing, spreads and slippage for exchange; imbalance fees if any |
| Liquidity | Owner-funded vault, manual replenishment | Liquidity providers, solvers, inventory management |
| Token supply | Owner `mint` and testnet `faucet_mint` | Issuer-controlled issuance tied to backing |
| Quote signing | One ed25519 key in an env var | HSM or KMS, key rotation procedure, monitoring |
| Admin control | Operator holds all roles; deploy key retained | Multisig owner, distinct role holders, locked keys |
| Contract upgrades | Redeploy, no migration | Reviewed upgrade path |
| Network | NEAR Testnet only | Mainnet deployment after audit and legal review |
| Chain scope | Same chain, same contract | Bridges, Chain Signatures, proof-verified settlement (deferred) |
| Intents, solvers | Not integrated | NEAR Intents routes, multi-solver quoting (deferred) |
| Confidential execution | Not built | Supported confidential route, key custody, disclosure model (deferred) |
| Agents / MCP | Not built | Read-only tools first, then constrained write tools (deferred) |
| User authentication | None; the wallet signature on the transfer is the authority | Session or wallet-based auth for private data |
| Monitoring and alerting | Reconciler endpoint and runbooks | Alerting, on-call owner, incident process |
| Backups | Local Postgres, no tested restore | Backup and restore drills |
| External audit | None | Independent audit before real assets |
| Legal | None; testnet and synthetic only | Jurisdiction- and asset-specific legal review |

See also [ADR 0010](../decisions/0010-deferred-scope.md) for the deferred features and [the threat model](../threat-model/mvp.md) for accepted limitations.
