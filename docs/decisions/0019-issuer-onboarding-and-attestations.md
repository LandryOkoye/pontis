# ADR 0019: Issuer onboarding and authenticated attestations

- **Status:** Proposed
- **Date:** 2026-11-11
- **Brief items:** expansion brief §5 (Workstream C)
- **Related:** [0014](0014-scope-expansion-beyond-mvp.md), [0016](0016-price-reference-and-route-guards.md), [0017](0017-corporate-actions-and-multiplier-epochs.md), [0003](0003-admin-roles-and-pause.md), [0005](0005-allowlist-eligibility.md), [0009](0009-synthetic-evidence-labelling.md)

## Context

The registry can currently record an issuer and evidence, but a registrar can make all of the associated claims. That is insufficient for reserve attestations, issuer-controlled redemption, and a permissioned bridge. Phase 3 adds the authenticated workflow and separation of duties that phases 4 and 6 consume. The demo remains entirely synthetic and testnet-only: a valid signature identifies its signer; it does not establish the truth of a claim.

## Decision

### 1. Roles, keys and separation of duties

The core stores account roles for `registrar` and `compat_approver`, plus registered ed25519 attester keys. An attester key has an immutable ID, scope set, enabled state and optional expiry. Valid scopes are `kyb`, `legal`, `custody`, `audit`, `eligibility`, `reserve`, and `bridge`.

`price_publisher` remains the dedicated key set introduced by ADR 0016. A registered attester with the `reserve` or `bridge` scope is the source of the phase 4 `reserve_attester` and phase 6 `bridge_attester` authority. This avoids two registries for the same signed-attestation mechanism.

Every state-changing method requires 1 yoctoNEAR, respects the pause state, checks its role, and emits a NEP-297 event. The contract refuses an issuer application when its proposer is also its approval account, and refuses an attestation or approval when its account is the application's proposer. The same distinct-proposer rule applies to compatibility approval. Actor account IDs are retained in the append-only application history.

### 2. Onboarding and account control

An authenticated issuer account submits an `IssuerApplication` containing the issuer record, evidence references, and controlled-account candidates. It is `submitted`, `evidence_verified`, `attested`, `approved`, `rejected`, or `expired`; its history is append-only.

Evidence content is stored off-chain through an `EvidenceStore` interface with local filesystem, S3-compatible, and IPFS implementations. The API calculates SHA-256 when it accepts an upload and the evidence verifier reads it back and compares the bytes before an attester may sign. Only the URI, hash and metadata are stored on chain.

Each controlled account proves control by calling `confirm_account_control(issuer_id, application_id)` on the core. For a token contract, the synthetic-token contract exposes an owner-authorized forwarding method that makes this call, so the core observes the token account as its predecessor. A candidate is usable only after that exact predecessor proof is recorded. The issuer cannot activate or register a representation until all listed token contracts have proven control.

### 3. Signed issuer attestations and verification status

An attestation covers this canonical Borsh payload:

```text
domain = "pontis-issuer-attestation-v1"
version, core_account, issuer_id, application_id, claim_hash,
evidence_hashes, scope, issued_at_ms, expires_at_ms, attester_key_id
```

The contract reconstructs the bytes, verifies the ed25519 signature against a registered, in-scope, unexpired key, rejects timestamps outside the configured clock-skew and maximum-validity bounds, and stores the result with its signature and signer ID. An attester may revoke its own attestation; it can never alter a stored payload.

`verification_status` becomes `third_party_attested` only when an unrevoked, unexpired attestation covers the issuer. It becomes `independently_verified` only when the configured threshold (default two) is met by distinct keys with distinct scopes. No registrar action may raise either status. Synthetic issuers remain routeable when their attestations expire, but their API records remain synthetic and unverified. A non-synthetic issuer with no current attestation is restricted for new conversion and bridge entries; redemption and reclaim exits remain available.

### 4. Representation policy and eligibility credentials

Representation registration requires an active issuer, an active issuer attestation, proven token-account control, an authorized category, and a reference to the issuer attestation used for approval.

`TransferPolicy` stores eligible jurisdictions, investor classes, minimum and maximum holdings, and a lockup end. The existing allowlist remains the default enforcement provider. `EligibilityProvider` adds a verified credential option: an in-scope `eligibility` key signs an account, representation, claims hash, issued and expiry timestamps, and nonce. The core verifies the signature and expiry at execution. Credentials supplement rather than bypass policy bounds.

### 5. API authentication and portal

The issuer portal uses NEP-413 login, following [`docs/research/nep-413-auth.md`](../research/nep-413-auth.md). A session is short-lived, audience-bound, and account-bound. RBAC is derived from the on-chain role view and re-checked before sensitive actions. Audit rows record the NEAR account ID and action, never a bearer-key fingerprint or the signed message.

The portal exposes application creation, evidence upload and verification state, controlled-account actions, and attestation status. The reviewer queue returns exact transactions for the registrar, attester, or approver wallet to sign. The API has no issuer, registrar or attester private key.

## Consequences

- Phase 4 can rely on a `reserve`-scoped signer registry and a verified issuer to accept reserve reports, enforce mint headroom, and route redemption work.
- Phase 6 can rely on the same issuer, eligibility and `bridge`-scoped signer mechanisms for bridge authorization.
- A verified attestation still depends on the diligence of its attester. The demo's attesters, evidence store and issuers are simulated and must carry `simulated: true` and a source label in every API response.
- Sessions prove current control of a NEAR account; they are not KYC and do not authorise the backend to transact for the account.
- The implementation needs contract unit and sandbox tests for every role collision, signature failure, evidence mismatch, expiry, revocation and account-control failure, plus API tests for nonce replay and revoked keys.
