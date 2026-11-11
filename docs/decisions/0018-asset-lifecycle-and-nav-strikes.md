# ADR 0018: Asset lifecycle and NAV strikes

- **Status:** Accepted
- **Date:** 2026-11-11
- **Brief items:** expansion brief §4.3 (Workstream B)
- **Related:** [0016](0016-price-reference-and-route-guards.md), [0017](0017-corporate-actions-and-multiplier-epochs.md), [0003](0003-admin-roles-and-pause.md)

## Context

The registry has a `Status` (`active`, `restricted`, `paused`, `deprecated`, `rejected`). Real instruments have richer lives: a fund strikes a NAV once a day and cannot convert between strikes at a fair price, a note matures and is redeemed, a property record should never be swapped at all. The route gate must know, and every transition needs a recorded actor and evidence.

## Decision

### 1. Lifecycle sits beside `Status`

`Status` stays the registry's switch and keeps its transitions ([0003](0003-admin-roles-and-pause.md)). A separate `Lifecycle` record, stored per representation in a side map (absent means the default below), adds what `Status` cannot say:

- `kind`: `fungible` (default), `nav_fund`, `term_instrument`, `unique`.
- Flags: `no_conversion` (the route is refused with `NOT_CONVERTIBLE`), `transferable_only_via_bridge` (informational for the bridge, phase 6; implies `no_conversion`).
- `stage`: `active` (default), `nav_strike_window` (reserved name, see section 3; for a `nav_fund` it is derived, not stored), `matured`, `redeeming`, `redeemed`, `delisted`.
- `history: Vec<LifecycleEntry { from, to, by, at_ms, evidence_hash: Option<String>, note }>`, append-only.

The overall state shown by the API combines `Status`, `stage`, the computed freeze or pending-action state and the NAV window: `DRAFT` (registered `restricted`, never active), `ACTIVE`, `CORPORATE_ACTION_PENDING` (computed, [0017](0017-corporate-actions-and-multiplier-epochs.md)), `RESTRICTED`, `PAUSED`, `DEPRECATED`, `DELISTED`, `NAV_STRIKE_WINDOW` (computed), `MATURED`, `REDEEMING`, `REDEEMED`. This is the brief's chain without storing a state that can be derived.

### 2. Transitions

`set_lifecycle_stage(representation_id, to, evidence_hash, note)`, `registrar`, 1 yoctoNEAR, evented, appends history. Allowed: `active -> matured | delisted`; `matured -> redeeming | delisted`; `redeeming -> redeemed`; `redeemed -> delisted`. `delisted` and `redeemed` accept nothing except `redeemed -> delisted`. Only `term_instrument` may enter `matured`, `redeeming` or `redeemed`. Moving to `delisted` needs a `compat_approver` other than the caller of the previous registrar action: it is a two-step call, `request_delist` by `registrar` and `approve_delist` by `compat_approver` with a different account. `set_lifecycle_flags(representation_id, kind, no_conversion, bridge_only)` is `registrar` and only while the stage is `active`; it bumps the `compatibility_version` of every relationship of the representation.

### 3. Route gate

`check_route` refuses, in this order, after the status checks: `not_convertible` (`no_conversion` or bridge-only), `lifecycle_blocked` (stage other than `active`), `nav_window_closed` (a `nav_fund` with no strike, or `now >= latest_strike.cutoff_ms`, or the strike's NAV is older than twice the strike interval). Exits (redemption, bridge out) are separate flows with their own checks and are not blocked by `matured` and `redeeming`.

### 4. NAV strikes and forward pricing

A `NavStrike { as_of_ms, nav_per_unit, cutoff_ms, currency, source, simulated }` is posted with `submit_nav_strike(attestation, signature)`, the same pattern as prices: a `price_publisher` key signs `b"pontis-nav-v1" ++ borsh(version, contract, representation_id, nav: u128 (8 decimals, per whole token), currency, as_of_ms, cutoff_ms, simulated, source)`. It is accepted only if `as_of_ms` is newer than the last strike, `cutoff_ms > as_of_ms` and `cutoff_ms - as_of_ms <= 7 days`. The window is **`[as_of_ms, cutoff_ms)`**.

**Decision on forward pricing.** The brief allowed execution at the next strike, modelled as a pending conversion. **This phase does not build pending conversions.** A conversion involving a NAV asset is quotable and executable only inside an open window and is priced off that window's strike through the deviation guard ([0016](0016-price-reference-and-route-guards.md)): the strike NAV is the reference price of the `nav_fund`. A user who wants the next strike waits for the next window. A pending-conversion state needs an escrow and a settlement trigger, which belong with the redemption and bridge machinery (phases 4 and 6). The decision is recorded in `known-limitations.md`.

### 5. Events and API

`LifecycleStageChanged`, `LifecycleFlagsChanged`, `DelistRequested`, `NavStrikePosted`. The API serves `GET /v1/assets/{id}/lifecycle` (computed state, flags, history), `GET /v1/assets/{id}/nav` (latest strike and window) and `GET /v1/routes/{from}/{to}/guards`. The indexer mirrors lifecycle history and NAV strikes.

## Consequences

- Unique and illiquid assets are not forced into the fungible model: `unique` plus `no_conversion` refuses conversion and leaves bridging for phase 6.
- `matured` and `redeeming` instruments cannot be converted away from the issuer's redemption; the redemption flow (phase 4) is what lets holders exit.
- Nothing here changes `Status` semantics, so existing registry tooling and the MVP seed are unaffected; a representation with no lifecycle record is a `fungible` asset in stage `active`.
