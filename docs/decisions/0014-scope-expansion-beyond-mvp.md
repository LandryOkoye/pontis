# ADR 0014: Scope expansion beyond the MVP

- **Status:** Accepted
- **Date:** 2026-11-11
- **Brief items:** the backend expansion brief (`PONTIS_MVP_TO_DEMOABLE-BACKEND.md`, kept locally and not committed), §0, §2 and §14
- **Related:** supersedes parts of [0010](0010-deferred-scope.md); amends the scope lines of `BuildPlan.md` (top and §11); will supersede parts of [0003](0003-admin-roles-and-pause.md) and [0006](0006-quote-signing-model.md) when their workstreams land

## Context

The MVP is built: a same-chain parity conversion between two synthetic NEP-141 tokens, with an indexer, a reconciler and a Fastify API. [ADR 0010](0010-deferred-scope.md) and `BuildPlan.md` §11 forbid almost everything beyond that ("a PR that builds a deferred item is rejected unless a new ADR supersedes this one"). The next goal is a protocol that demonstrates the hard parts (issuer cooperation, permissioned transfers, cross-chain settlement, market-aware conversion) and has the data layer a product UI needs. That needs most of the deferred list.

This ADR is the supersession ADR 0010 asks for. It does not change code. It records the new scope, the preconditions Pontis accepts for it, the new trust assumptions, and the rules that stay fixed.

## Decision

### 1. What is brought into scope

| Workstream | Content                                                                                          | Supersedes in ADR 0010                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| A          | Market context, competitor analysis, success metrics and their endpoints                         | none (docs and read-only API)                                                                            |
| B          | Corporate actions, multiplier epochs, price-deviation guard, circuit breaker, lifecycle          | "lifecycle engine"                                                                                       |
| C          | Authenticated issuer onboarding, attester roles, NEP-413 sign-in, attestation-backed eligibility | "issuer adapters", "a real KYC/eligibility provider" (mechanism only; see section 3)                     |
| D          | Custody registry, proof-of-reserve, mint headroom, redemption lifecycle                          | none new (extends item "custody and backing" in `deliberately-mocked.md`)                                |
| E          | Market-priced routes, liquidity pools with LPs, slippage, multi-source quotes                    | "market-priced exchange", "multi-solver markets"                                                         |
| F          | Bridge between NEAR and one EVM chain (Anvil locally, one public testnet), both bridge models    | item 9, "External chain"                                                                                 |
| G          | Multisig owner, timelock, `migrate()`, key rotation with overlap, signer abstraction, alerting   | parts of [0003](0003-admin-roles-and-pause.md) items 5 and 7, [0006](0006-quote-signing-model.md) item 6 |
| H          | Chain Signatures adapter, NEAR Intents adapter                                                   | items 9 and 10                                                                                           |
| I          | Operator-trusted private RFQ, batched settlement, selective disclosure                           | item 11, "Confidentiality"                                                                               |
| J          | Trading and discovery data platform: price points, candles, stats, SSE, search, portfolio        | none (read-side data platform; the "settlement manager" stays deferred)                                  |
| K          | One-command demo, scenarios, simulators, runbooks                                                | none                                                                                                     |

Order and cut list follow brief §14: phases 0 to 9, and if time runs short cut last-first: confidentiality extras, a real KMS backend (the interface stays), a real Intents integration (the simulator stays). The guards (B), issuer authentication (C), reserves and redemption (D), the bridge supply invariant and refund paths (F) and honesty labelling are never cut.

### 2. What stays out of scope

- **Real funds, real RWAs and any claim of regulated activity.** Testnet and synthetic assets only (ADR 0010 item 14 is unchanged).
- **MCP and agent-initiated transactions** (item 12) and the **protocol token** (item 13) stay deferred under their ADR 0010 preconditions.
- **Mainnet deployment.** Nothing in this scope is an audit or legal clearance.
- **Frontend.** `apps/web` belongs to the frontend worker. The backend worker never edits it; the contract between them is the API (`packages/api-types`, OpenAPI, fixtures, `docs/api/FRONTEND_HANDOFF.md`).

### 3. Process gates

1. **ADR before implementation.** Each workstream, and each decision inside it that the brief leaves open (for example the corporate-action model, the pool curve, the bridge verifier, the multisig choice), gets its own ADR merged before the implementation PR. A PR that builds an item without a merged ADR is rejected, exactly as before.
2. **Research before integration.** Before any external integration (Chain Signatures, NEAR Intents, Confidential Intents, an EVM testnet, a KMS), the current official documentation is read and what was verified is recorded in `docs/research/<topic>.md` with URL and date. Nothing is built on an endpoint, contract name or response shape that was not seen. If a surface does not exist on testnet, the adapter interface and a labelled simulator are built and `deliberately-mocked.md` says so.
3. **Adapter pattern.** Every external dependency sits behind an interface with a real implementation, a local or simulated implementation and tests against the interface. The offline demo runs on simulators and switches to testnet by configuration.
4. **Truth in docs.** The PR that changes what is real updates `known-limitations.md`, `deliberately-mocked.md` and the threat model in the same PR. Each feature is described as one of: real on-chain logic, a testnet integration, or a local simulator.
5. **Git rules unchanged.** `BuildPlan.md` §4 (commit size, messages, one branch per feature, merge commits, no local merges, nobody pushes to `main`) applies to every PR in this scope.

### 4. Invariants that must not weaken

- Quotes are bound to user, pair, amounts, fee, expiry, nonce, compatibility version and policy version, and the contract recomputes and compares everything at execution.
- Nonces are single use.
- Integer math only, checked arithmetic, rounding in the protocol's favour. No floating point for amounts anywhere; simulators that use random walks produce prices as decimal strings and quantise them before any amount math.
- Every state-changing contract method requires 1 yoctoNEAR, checks role and pause state, and emits a NEP-297 event.
- Settlement is callback-based with a compensating refund. Anything that cannot be resolved ends `REQUIRES_RECONCILIATION`, never silently stuck.
- The indexer is idempotent and cursor-based. The reconciler flags and does not silently repair.
- No user keys in the backend. The API returns the exact transaction or calldata for the wallet to sign.
- `verification_status` rises only through a verified, authenticated attestation. Nothing becomes `independently_verified` on a registrar's word.
- Honesty labelling: every price, NAV, reserve figure, attestation and chart point carries a `source` and a `simulated` flag, in code, API responses and docs, so a UI cannot present simulated data as real.

### 5. Preconditions accepted from ADR 0010

| ADR 0010 item       | Precondition stated there                                                                         | How it is met here                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9. External chain   | Verified route support for bridge, signing and proofs; a route threat model                       | Research docs for Chain Signatures and the chosen EVM testnet; `docs/threat-model/bridge.md` before the bridge PR merges; Anvil for CI                                          |
| 10. NEAR Intents    | Target assets and routes confirmed; solver integration design                                     | `docs/research/near-intents.md`; the adapter is built only for verified surfaces; a restricted asset is refused where Intents cannot enforce eligibility                        |
| 11. Confidentiality | A standard route works; a supported integration is confirmed; key custody and disclosure reviewed | Standard and bridge routes land first (phases 2 to 6); `docs/research/confidential-intents.md`; `docs/threat-model/confidential.md`; the matcher is labelled `operator_trusted` |

### 6. New trust assumptions

These are accepted for the testnet demo and must be stated wherever the feature is described:

| Component                     | What must be trusted                                                                                  | Where it is documented                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Issuer attesters              | The attesters' keys and diligence; a verified signature proves who signed, not that the claim is true | Workstream C ADR, `known-limitations.md`        |
| Reserve attesters, custodians | Reserve reports; in the demo they are simulated                                                       | Workstream D ADR                                |
| Price publishers              | Signed price attestations; staleness and deviation are bounded on chain, correctness is not           | Workstream B ADR                                |
| Bridge attester threshold     | M of N attesters do not collude (the weaker destination-authority mode)                               | Workstream F ADR, `docs/threat-model/bridge.md` |
| Chain Signatures MPC network  | The MPC signer set and the derived-address scheme (the stronger mode)                                 | `docs/research/chain-signatures.md`             |
| Relayer                       | Liveness only; it cannot mint without a valid authority signature                                     | Workstream F ADR                                |
| Private-RFQ matcher           | It sees every order (`confidentiality_level: "operator_trusted"`)                                     | `docs/threat-model/confidential.md`             |
| Simulators                    | Nothing; every simulated source is labelled and separable by filter                                   | `deliberately-mocked.md`                        |

## Consequences

- ADR 0010 stays as the record of MVP scope. Its rows for items 9, 10 and 11 and the "also deferred" line (except the settlement manager) are superseded as set out in section 1; items 12, 13 and 14 stand.
- The `BuildPlan.md` scope statement (top "Out of scope" list and the last §11 bullet) describes the MVP and is not edited; this ADR governs everything built after it. The `README.md` MVP-scope text is revised in the PR that delivers Workstream A.
- A reviewer applying the BuildPlan §11 rule checks two things: a merged ADR for the item, and that the section 4 invariants hold.
- Scope is much larger than the MVP and the cut list in section 1 is the only sanctioned way to shrink it. Dropping a safety invariant or an honesty label is not a cut.
- Each phase ends with a report in `docs/progress/phase-N.md` (what shipped, what is simulated, open risks) and an updated frontend handoff document when the API changed.
