# ADR 0012: Reconciliation

- **Status:** Accepted
- **Date:** 2026-11-09
- **Brief items:** §7.4, §13.2, §24.3
- **Related:** [0008](0008-vault-inventory-and-funding.md), [0011](0011-indexer.md)

## Context

The indexer settles conversions from events, and the vault is meant to hold at least what its inventory records (ADR 0008). Both can go wrong without any error: an event is never seen, a transaction never lands, a token is sent to the core outside `ft_transfer_call`. Something must notice and make it visible.

## Decisions

1. **Where.** The reconciler runs inside `apps/indexer` on its own interval (`RECONCILE_INTERVAL_MS`, 60 s). It reads the database and the chain's final-state views, never writes to the chain, and holds no keys.
2. **Stuck submissions.** A quote still `SUBMITTED` `RECONCILE_STUCK_AFTER_MS` (10 min) after the wallet reported its hash, with no outcome event stored, moves to `REQUIRES_RECONCILIATION`, with a reason on the conversion and an `audit_log` row. The contract refuses an expired quote, so a submission this old cannot still be pending. The reconciler flags and does not guess: whether the transaction failed or the indexer missed it is for a person, or for the indexer, which settles a flagged quote by itself if its matching event does arrive later.
3. **Settlement consistency.** For quotes touched in the last 7 days: a `SETTLED` quote with no `conversion_completed` event, a stored completion on a quote that is not settled, and a settled quote whose event shows another user or amount are reported. They are reported, not repaired: a settled quote is final in the state machine.
4. **Vault solvency.** For every representation the reconciler compares `get_inventory` with the token's `ft_balance_of(pontis-core)`. Inventory above the balance means the core owes tokens it does not hold (`VAULT_INSOLVENT`, critical). A balance above inventory means a direct transfer (`VAULT_UNTRACKED_BALANCE`, warning); the contract has no method to credit or sweep it (see the ADR 0008 amendment).
5. **Two sightings.** A vault finding is reported only when it shows in two consecutive runs. Inventory and balance are separate reads, and a conversion in flight moves them in different blocks, so a single reading can disagree for a moment. Inventory is read first, so a funding between the reads can only make the balance look larger.
6. **Reporting.** The latest run is one row in `reconciliation_report`. A finding keeps its first-seen time while it persists, and each new finding writes one `audit_log` row. `GET /v1/admin/reconciliation` serves the run plus the quotes currently in `REQUIRES_RECONCILIATION`.
7. **Admin auth.** The endpoint takes `Authorization: Bearer <ADMIN_API_KEY>` and is closed to everyone when no key is configured. B14 adds rate limiting and an audit trail for privileged calls.

## Consequences

- A stuck or inconsistent conversion becomes visible within about a minute plus the stuck threshold, not when a user complains.
- Nothing is repaired automatically except a flagged quote whose matching event arrives, so the reconciler cannot make a wrong state worse.
- The vault check needs the representation list in the database, so it follows the registry sync, and a vault on a representation the sync has not seen is not checked.
