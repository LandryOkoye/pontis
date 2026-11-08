# ADR 0005: Allowlist eligibility

- **Status:** Accepted
- **Date:** 2026-11-07
- **Brief items:** §24 item 5, §16.5, §19.3
- **Related:** [0004](0004-compatibility-and-policy-versioning.md)

## Context

Real RWAs carry investor eligibility and transfer restrictions (brief §6.6 item 8, §16.1). The MVP uses synthetic assets, but the code path that enforces eligibility has to exist and be tested, and it must not hard-wire an allowlist as the only possible mechanism.

## Decision

1. **Per-representation allowlist** in `pontis-core`'s `policy` module. A conversion requires the sender (`quote.user`) to be allowlisted for **both** the input and the output representation when that representation's policy has `allowlist_required = true`.
2. **Membership is managed by `registrar`** and every change emits `allowlist_updated`. Admin tooling is `scripts/allowlist.ts`.
3. **Checked at quote time and at execution time.** The API checks the on-chain allowlist before signing a quote (refusal code `NOT_ELIGIBLE`); the contract re-checks live in `ft_on_transfer`. Membership changes do not bump `policy_version` ([0004](0004-compatibility-and-policy-versioning.md)).
4. **Rule changes are versioned.** Toggling `allowlist_required` or changing other policy rules bumps `policy_version`.
5. **Adapter seam.** In the API, eligibility is behind an `EligibilityProvider` interface (`check(account, representation) -> {eligible, reasonCode}`) with the on-chain allowlist as the only MVP implementation. Issuer-specific checks are future adapters. The contract does not call external adapters in the MVP.
6. **The allowlist is not KYC.** It records that an operator approved an account for a synthetic test asset. It makes no statement about identity, jurisdiction or regulatory status, and the UI says so.

## Consequences

- The recipient of the converted tokens is always the sender; there is no third-party recipient in the MVP, so only one account needs checking.
- A removed account's in-flight quote fails at execution and its input is refunded.
- Real eligibility (KYC/KYB, jurisdiction, lockups) is explicitly out of scope until legal review ([0010](0010-deferred-scope.md)).

## Amendments (B6)

- Membership is changed with `set_allowlist(representation_id, account_ids, allowed)`, up to 50 accounts per call, one `allowlist_updated` event per call.
- `is_allowed(representation_id, account)` is true when the representation does not require an allowlist or the account is on it. Conversion (B7) checks it for the input and the output representation.
