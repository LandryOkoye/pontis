# ADR 0017: Corporate actions and multiplier epochs

- **Status:** Accepted
- **Date:** 2026-11-11
- **Brief items:** expansion brief §4.1 (Workstream B)
- **Related:** [0016](0016-price-reference-and-route-guards.md), [0018](0018-asset-lifecycle-and-nav-strikes.md), [0001](0001-synthetic-claim-and-units.md), [0004](0004-compatibility-and-policy-versioning.md)

## Context

[ADR 0001](0001-synthetic-claim-and-units.md) made `unit_multiplier` immutable. Real stocks and funds split, pay dividends, merge and delist, and different issuers apply the same action at different times, sometimes in different ways. Between the moment one wrapper has applied a split and the moment the other has, a fixed-ratio conversion is wrong by the split factor. The contract must refuse in that gap, and it must do so from computed state, not from someone remembering to set a flag.

## Decision

### 1. The record

`CorporateAction` belongs to a canonical asset. Fields: `id` (`{asset_id}-{n}`), `asset_id`, `kind` (`split`, `reverse_split`, `dividend_cash`, `dividend_stock`, `merger`, `spin_off`, `delisting`, `symbol_change`, `custom`), `announced_at_ms`, `ex_date_ms`, `effective_ms`, `freeze_from_ms`, `freeze_until_ms`, `multiplier_change: Option<Ratio>`, `evidence: Vec<EvidenceRef>`, `status`, `proposed_by`, `approved_by`, `applied_representations: Vec<String>`, `history` (append-only, actor and time per entry).

**Status** is `proposed`, `approved`, `applied`, `cancelled`. The brief listed `announced` and `frozen`; as built, `proposed` is the announcement and "frozen" is **computed from the clock** (an `approved` action whose freeze window contains now), never stored, so it cannot be left on by mistake. Transitions: `proposed -> approved | cancelled`; `approved -> applied | cancelled`; `applied` and `cancelled` are terminal. Cancelling an approved action after its effective time is refused (use a new action to correct it).

**Validation.** `freeze_from_ms <= effective_ms <= freeze_until_ms`; `announced_at_ms <= freeze_from_ms`; a `split` or `reverse_split` has `multiplier_change`, and `dividend_cash`, `symbol_change` and `custom` may not; the multiplier change is a positive ratio in lowest terms; at most 32 actions per asset and 16 epochs per representation.

**Roles.** `registrar` proposes and records evidence; `compat_approver` approves and cancels; the proposer cannot approve (enforced now for this record, generalised in phase 3).

### 2. Multiplier epochs

A representation's multiplier becomes a schedule: `epochs: Vec<MultiplierEpoch { effective_ms, multiplier: Ratio, action_id }>`, the first entry being the registration multiplier with `effective_ms = 0` and `action_id = "genesis"`. The **effective multiplier** at time `t` is the last epoch with `effective_ms <= t`. The rule becomes "immutable once effective; scheduled changes only through an approved corporate action".

`apply_corporate_action(action_id, representation_id, new_multiplier)` (`registrar`, 1 yoctoNEAR, evented) appends an epoch with `effective_ms = action.effective_ms`. It requires: the action is `approved`; the representation belongs to the action's asset; it has not applied this action; for an action with `multiplier_change`, `new_multiplier == effective_multiplier_at(effective_ms) * multiplier_change` exactly (the issuer cannot apply a different factor than the approved one); for an action without it, `new_multiplier` is absent. When every representation of the asset has applied it the action becomes `applied`. `settle_corporate_action(action_id)` (`registrar`) marks an approved action with no multiplier change `applied` once `effective_ms` has passed (dividends and symbol changes: data and events only, no on-chain distribution).

Applying an epoch bumps the `compatibility_version` of every relationship that involves the representation, so quotes signed before are refused.

### 3. Route state is computed

`check_route` adds these checks, in this order after the existing status checks and before the compatibility checks, all against the clock at execution time:

1. **`corporate_action_freeze`** if any `approved` action of either asset has `freeze_from_ms <= now < freeze_until_ms`.
2. **`corporate_action_pending`** if any `approved` action of either asset has `effective_ms <= now` and some representation of that asset has not applied it, and the action has a `multiplier_change`. This is the "issuers disagree" case: the route stays refused until every wrapper has applied, or the action is cancelled before its effective time.
3. **`epoch_mismatch`** if the quotient of the two effective multipliers differs from the multiplier basis the relationship was approved on. The relationship stores `approved_multipliers: (Ratio, Ratio)` at approval; the live quotient `mult_from / mult_to` must equal `approved_multipliers.0 / approved_multipliers.1`. A uniform split applied to both wrappers keeps the quotient and the route resumes at the same ratio, with every old quote voided by the version bump. A non-uniform change (one wrapper redenominated and the other not) leaves the route refused until a `compat_approver` re-proposes and approves the pair at the new ratio, which creates a new version.

`get_route` also returns `next_freeze_ms: Option<u64>`, the earliest upcoming `freeze_from_ms` of an `approved` action. The API refuses to sign a quote whose expiry would pass it and clamps the expiry to it otherwise. The contract re-checks at execution regardless.

### 4. Events and indexer

New NEP-297 events: `CorporateActionProposed`, `CorporateActionApproved`, `CorporateActionCancelled`, `CorporateActionApplied` (per representation and when complete), `MultiplierEpochAdded`. The indexer stores them in `corporate_actions` and `multiplier_epochs` mirror tables. The reconciler flags an `approved` action more than one hour past `freeze_until_ms` that is not `applied` or `cancelled` (`CORPORATE_ACTION_OVERDUE`).

### 5. Not done here

No cash distribution engine, no automatic rebasing of balances, and no cross-issuer negotiation of how a split is applied. The contract records the action, enforces the freeze and the agreement of epochs, and tells the API why a route is closed.

## Consequences

- State layout changes (new maps, new fields on `Representation` and `Compatibility`). Contracts are redeployed on testnet; real migration is phase 7.
- Existing MVP relationships get `approved_multipliers` from the live multipliers when the relationship is next approved; the seed re-approves the demo pairs.
- The unit-multiplier immutability in [0001](0001-synthetic-claim-and-units.md) is superseded in the manner above; decimals stay immutable.
- A wrapper that never applies an approved split blocks every route that touches it. That is deliberate: it is the issuer's cooperation failing, and the route should not run through it.
