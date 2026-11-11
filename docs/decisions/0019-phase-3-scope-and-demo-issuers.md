# ADR 0019: Phase 3 scope: wallet sign-in and a role registry; demo issuers stay mocked

- **Status:** Accepted
- **Date:** 2026-11-11
- **Brief items:** expansion brief §5 (Workstream C), §14 phase 3, §4 role separation. Narrows [0014](0014-scope-expansion-beyond-mvp.md).
- **Related:** [0003](0003-admin-roles-and-pause.md), [0009](0009-synthetic-evidence-labelling.md), [0013](0013-api-hardening.md), [0016](0016-price-reference-and-route-guards.md)

## Context

Workstream C asked for a real issuer onboarding workflow (application, evidence check, proof of account control, signed third-party attestations, expiry and revocation, approval), an issuer portal API and representation-level attestation checks. The product owner decided that issuers and assets in this demo are **mock data presented realistically**, so the onboarding mechanism would be built only to onboard fictional issuers. Two parts of Workstream C do not depend on it and later phases need them: wallet sign-in for operators (it replaces one shared admin key) and the roles that sign attestations (`reserve_attester`, `bridge_attester`).

## Decision

### 1. What is cut

The onboarding application and review flow (§5.2), the issuer portal API (§5.4 second bullet), proof of account control, third-party issuer attestations with expiry and revocation, representation-level attestation checks and the transfer-policy or eligibility provider (§5.3). The contract keeps refusing `independently_verified`, and no issuer is `third_party_attested`. The registrar still registers issuers and evidence as before ([0009](0009-synthetic-evidence-labelling.md)).

### 2. What is kept

**Role registry.** `RoleName` gains `attester`, `reserve_attester` and `bridge_attester` (appended; nothing reordered), granted and revoked with the existing `grant_role` and `revoke_role`. A role names who may act; signing authority is a registered key. An owner-managed **signer key registry** (`add_signer_key(role, account_id, public_key, scopes)`, `remove_signer_key`) stores, per role, the ed25519 keys whose signatures that role's attestations carry, each tied to an account that holds the role and a scope list (such as `reserves`, `custody`, `bridge`). Keys are capped per role. Later workstreams verify against this registry; this phase adds no attestation type. The existing `price_publisher` key set stays as it is.

**Separation.** Proposer and approver already differ for compatibility, corporate actions and delisting. The registry adds one more rule: an account may not hold `registrar` together with an attester role (`grant_role` refuses it, and so does a later grant of the other role). The owner may hold neither.

**Wallet sign-in (NEP-413).** The API replaces the shared admin key with a sign-in:

1. `POST /v1/auth/challenge {accountId}` returns a server-made `nonce` (32 random bytes, single use, 5 minutes), the `recipient` (the configured API audience) and the exact `message`.
2. The wallet signs it under NEP-413 (`signMessage`); `POST /v1/auth/verify {accountId, publicKey, signature, nonce}` rebuilds the payload (`tag 2^31 + 413`, message, nonce, recipient, optional callback URL), checks the ed25519 signature over its SHA-256, consumes the nonce, and checks over RPC that the key is an access key of the account.
3. A session follows: an opaque random token (stored only as a hash) with a 15 minute lifetime, renewable up to 8 hours, revocable by `POST /v1/auth/logout`. Not a JWT: the API is the only verifier and revocation must be immediate.
4. **RBAC comes from the chain.** The role set of an account is read from the contract (`get_account_roles`) at sign-in and cached for 60 seconds. Sensitive actions re-read it. An account with no role may sign in and holds no admin rights.
5. **Audit rows name the account** (and the key), not a key fingerprint. The legacy `ADMIN_API_KEY`, when set, still works as a break-glass actor labelled `legacy-admin-key` in the audit log; it is off by default and removed with the production posture work in phase 7.

The backend never holds an operator's key, and the signed message authorises only a session, never a chain transaction.

### 3. Demo issuers and assets

The catalogue is fictional and large enough to look like a market: tokenised treasuries and money-market funds, gold, real estate, private credit, public equities, stable-value tokens, carbon credits and a venture fund, issued by invented issuers in several jurisdictions with different attestation stories. Names, tickers and logos are invented, and none names or imitates a real company or product. Every record is `synthetic` and `unverified`/`issuer_attested` at most; every price, NAV, supply and trade is `simulated: true`. The frontend must show the demo-data marker the handoff describes ([0015](0015-market-data-platform.md)). Realistic presentation never extends to a claim of verification, backing, custody or regulation.

## Consequences

- Phase 4 (custody, reserves, redemption) uses the role registry and the signer-key pattern directly; nothing waits for onboarding.
- "How does an issuer onboard?" has an honest answer: it does not, in this demo. `known-limitations.md` and `deliberately-mocked.md` say so; real onboarding stays a documented gap.
- Operators sign in with a wallet. The review queue and reconciliation endpoints move from a shared key to roles; the e2e suite keeps using the break-glass key until phase 7.
- A reader can mistake polished mock data for real data. The labels, the marker and the rule above are the mitigation (threat T22, T41); see the threat model.
