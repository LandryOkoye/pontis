# ADR 0003: Admin roles and pause controls

- **Status:** Accepted
- **Date:** 2026-11-07
- **Brief items:** §24 item 4, §13.2, §13.4, §16.2
- **Related:** [0002](0002-contract-layout-and-events.md)

## Context

Brief §13.2 requires "narrowly scoped administrative roles" and emergency pause. The MVP has a small team on testnet, but the role boundaries should match what a production deployment would need.

## Decision

`pontis-core` has four roles. Each role is a set of accounts, and grants and revocations are owner-only and evented.

| Role              | May do                                                                                                                                          | May not do                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `owner`           | grant/revoke roles, `set_quote_signer`, `set_fee_bps`, fund and withdraw vault inventory, **unpause**, transfer ownership                       | approve compatibility                     |
| `registrar`       | register issuers, canonical claims, representations and evidence; manage allowlist membership; request an `active` status for a complete record | approve compatibility, pause, change fees |
| `compat_approver` | propose, approve, reject and suspend compatibility relationships; re-approve a suspended relationship as a new version                          | register assets, manage allowlists        |
| `pauser`          | set global or per-asset pause; suspend a relationship                                                                                           | unpause, approve anything                 |

Rules:

1. **Pausing is asymmetric.** Any `pauser` can pause immediately; only `owner` can unpause. This keeps incident response fast and recovery deliberate.
2. **Suspension takes effect immediately** and is available to both `pauser` and `compat_approver`. Reinstatement is a new approved version by `compat_approver`.
3. **Pause granularity:** global, per representation, and per relationship (`SUSPENDED`). A conversion is blocked if any applies to either side.
4. **No role bypasses data rules.** An incomplete record cannot be set `active` by any role (brief §19.1).
5. **Separation of proposer and approver is not enforced on-chain** in the MVP, because a single testnet operator holds several roles. Both accounts are recorded in the relationship history, and the threat model records this as an accepted limitation. Production use requires distinct accounts and a multisig owner.
6. **Admin and registrar actions run through `scripts/`** using NEAR CLI credentials. The API never holds these keys ([0006](0006-quote-signing-model.md)).
7. **Upgrades:** no upgrade method in the contract. Testnet contracts are redeployed. The deploy account keeps its full-access key on testnet only; locking keys and using a multisig owner is a precondition for any non-testnet use and is out of scope.

## Consequences

- Initially one account may hold all roles on testnet; the role checks are still exercised in tests with separate accounts.
- API admin endpoints (BuildPlan B13, B14) are read-only views of chain state; they do not execute these roles.
