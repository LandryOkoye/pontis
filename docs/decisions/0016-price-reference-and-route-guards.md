# ADR 0016: Price reference, route guards and circuit breaker

- **Status:** Accepted
- **Date:** 2026-11-11
- **Brief items:** expansion brief §4.2 (Workstream B), §9.3 (partly)
- **Related:** [0014](0014-scope-expansion-beyond-mvp.md), [0015](0015-market-data-platform.md), [0001](0001-synthetic-claim-and-units.md), [0003](0003-admin-roles-and-pause.md), [0004](0004-compatibility-and-policy-versioning.md), [0006](0006-quote-signing-model.md)

## Context

A parity route converts at a fixed ratio from a funded vault. Two wrappers of one claim trade at different market prices, so a fixed ratio invites adverse selection: everyone swaps the cheap wrapper for the expensive one until the vault is drained. The route needs a market reference it can check on chain, limits on how much can move, a fee that rises as the vault drains, and an automatic stop. The expansion brief asked for the corporate-action ADR to be 0015; that number was taken by the market data ADR, so the Workstream B decisions are 0016 (this), [0017](0017-corporate-actions-and-multiplier-epochs.md) and [0018](0018-asset-lifecycle-and-nav-strikes.md).

## Decision

### 1. Price reference on chain

- **Role `price_publisher`.** The owner registers ed25519 public keys with `add_price_publisher_key` and `remove_price_publisher_key` (1 yoctoNEAR, evented). The role is a set of keys, not accounts, because the publisher is an off-chain signer. Key rotation with overlap is phase 7; for now several keys may be registered at once, which gives overlap by hand.
- **`submit_price(attestation, signature)`** is callable by anyone (a relayer pays the gas), requires 1 yoctoNEAR, and is refused while the contract is paused. The signature is the authority, not the caller. The contract stores the latest price per representation and emits `PriceSubmitted`. History lives in events and in the indexer's `price_points`.
- **Signed payload.** `b"pontis-price-v2" ++ borsh(version: u8 = 1, contract: AccountId, representation_id: String, price: u128, currency: String, as_of_ms: u64, simulated: bool, source: String)`. `price` is per whole token at 8 decimals, the same scale as `price_points`. The contract rebuilds the Borsh bytes from the JSON fields (the quote pattern of [0006](0006-quote-signing-model.md)), and `test-vectors/price-attestation.json` pins one byte layout for Rust and TypeScript. The phase 1 off-chain format `pontis-price-v1` (text lines) is replaced: `@pontis/market-data` signs v2, the simulator is the only producer, and no stored v1 attestation is verified by anything.
- **Accepted only if:** the key is registered; `contract` is this contract; the representation exists; `price > 0`; `as_of_ms <= now + 60 s`; `as_of_ms` is strictly newer than the stored one (replay and rollback are impossible); `currency` is 1 to 8 uppercase ASCII letters.
- **`simulated` and `source` are stored and echoed** in every view and event. The contract does not act on `simulated`; it exists so no consumer can lose the label ([0014](0014-scope-expansion-beyond-mvp.md) section 4). A guard never compares a price with a different currency.
- **NAV.** Fund-style assets also get NAV strikes ([0018](0018-asset-lifecycle-and-nav-strikes.md)); a strike is a separate signed payload and the deviation guard uses the latest strike NAV as the reference price of a NAV asset inside its window.

### 2. Route guard

Each compatibility has an optional `RouteGuard`, set by `compat_approver` with `set_route_guard(a, b, guard)`. A relationship with no guard behaves exactly as in the MVP and the API and docs mark it `unguarded`. Setting or changing a guard bumps `compatibility_version`, so quotes signed under the old terms are refused (`COMPATIBILITY_CHANGED`).

| Field                               | Meaning                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `max_deviation_bps`                 | A conversion needs market deviation at most this. Range 1 to 10,000                        |
| `hard_deviation_bps`                | At or above this the breaker trips at once. At least `max_deviation_bps`, at most 10,000   |
| `trip_after`                        | Consecutive violations that trip the breaker. 1 to 10                                      |
| `max_price_age_ms`                  | A price older than this is stale. 1 minute to 7 days                                       |
| `stale_policy`                      | `fail_closed` (default) or `fail_open_with_wider_fee { extra_fee_bps }`, extra at most 200 |
| `min_amount_in`                     | Smallest input. 0 means none                                                               |
| `max_amount_in`                     | Largest input per transaction. 0 means none                                                |
| `window_ms`, `max_window_amount_in` | Largest total input per direction per tumbling window. Both 0 means none                   |
| `skew_max_bps`                      | Extra fee when the output vault is depleted. At most 400                                   |

**Deviation formula.** For a route `from -> to` with approved ratio `r = num/den` (output smallest units per input smallest unit), prices `P_from`, `P_to` (8 decimals, per whole token) and decimals `d_from`, `d_to`:

```text
market = (P_from * 10^d_to) / (P_to * 10^d_from)        // output smallest units per input smallest unit at market
deviation_bps = floor(10000 * |market - r| / r)
violated     = deviation_bps > max_deviation_bps
```

Evaluated exactly with a 256-bit intermediate: `|A*den - num*B| * 10000` against `max_bps * num * B`, where `A = P_from * 10^d_to` and `B = P_to * 10^d_from`. Overflow of the 256-bit product is a refusal (`PRICE_UNAVAILABLE`), never a pass. The direction is symmetric: `from -> to` and `to -> from` see the same deviation up to rounding. The rule measures how far the approved ratio is from the market, so it refuses a conversion that is a gift in either direction, not only one that hurts the vault. Both prices must exist, share a currency and be fresh.

**Stale or missing price.** `fail_closed`: refuse with `PRICE_STALE` or `PRICE_MISSING`. `fail_open_with_wider_fee`: convert, add `extra_fee_bps` to the effective fee, and report the guard as `degraded` in views and in the `conversion_completed` event.

### 3. Fee skew

Per route direction, the output representation's vault has a **reference inventory** `ref`, the largest spendable inventory it has held since the owner last set it (`fund_vault` raises it; `withdraw_inventory` lowers it to the new inventory; the owner may reset it with `set_inventory_reference`). With `inv_after = inventory - net_out`:

```text
depletion = max(0, ref - inv_after)              // 0 when ref = 0
skew_bps  = ceil(skew_max_bps * depletion^2 / ref^2)
fee_bps   = protocol_fee_bps + skew_bps (+ extra_fee_bps when degraded)   // at most 100 + 400 + 200
```

Quadratic, so a full vault pays nothing extra and a nearly empty one pays `skew_max_bps`. `net_out` depends on the fee, so the contract solves it once: it computes `net_out` at the base fee, derives `skew_bps` from `inv_after` at that `net_out`, and uses the resulting fee (a slight overcharge relative to a fixed point, always in the protocol's favour). The effective `fee_bps` goes in the signed quote, so the contract recomputes it and compares exactly as it compares `fee_bps` today (`FEE_CHANGED`). Shared vectors in `test-vectors/route-guard.json` pin the deviation, the skew and the window arithmetic for Rust and TypeScript.

### 4. Limits

Per transaction minimum and maximum, and a per-direction tumbling window (`window_start_ms`, `used_in`), are checked at execution against live state and refused with `AMOUNT_BELOW_MIN`, `AMOUNT_ABOVE_MAX` and `WINDOW_LIMIT_EXCEEDED`. The window counter advances only on a conversion that was accepted for execution. A payout failure restores inventory but does not restore the window: the attempt consumed the allowance, which prevents a griefer from probing for free. The window is tumbling, not rolling, because a rolling window needs a per-trade log; the API says so.

### 5. Circuit breaker

- **Evaluation points.** (a) `submit_price`, for every guarded relationship that involves the representation, after storing the price; (b) a conversion rejected for `PRICE_DEVIATION`, which counts as a violation. A passing check at (a) resets `consecutive_violations` to 0. A price that is stale or missing does not count: staleness is its own refusal.
- **Trip.** `deviation_bps >= hard_deviation_bps`, or `consecutive_violations >= trip_after`, suspends the relationship with the `suspend_compatibility` semantics (status `Suspended`, version bump, history entry), sets `suspended_by_breaker = true`, records `last_trip_ms` and `trip_count`, and emits `CircuitBreakerTripped { relationship, deviation_bps, reason }`. The trip is state the transaction commits: `submit_price` is a normal call, and a rejected `ft_on_transfer` returns the input and still commits the counter.
- **Reset.** Only `compat_approver`, with `reset_circuit_breaker(a, b)`. The caller must differ from the relationship's `proposed_by` and from the account that suspended it (the breaker records `breaker_actor = predecessor of the triggering call`, which for a price submission is the relayer). The call re-evaluates the guard on the current price and refuses (`GUARD_STILL_VIOLATED`) if it still fails, then returns the status to `Approved`, bumps the version and emits `CircuitBreakerReset`. A `pauser` can suspend but never reset. Generalising proposer not equal to approver to all approvals is phase 3 and [0003](0003-admin-roles-and-pause.md) item 5 stays in force until then.

### 6. Views

`get_route` gains `fee_bps` and `degraded`; new refusal values are listed in [0017](0017-corporate-actions-and-multiplier-epochs.md) and [0018](0018-asset-lifecycle-and-nav-strikes.md) and here: `price_deviation`, `price_stale`, `price_missing`, `price_unavailable`. `get_route_guards(from_id, to_id, amount_in: Option<U128>)` returns every check with `{name, passed, detail}` (route status, lifecycle, freeze, epochs, price freshness, deviation, limits, window, vault inventory, breaker state) so the API can explain a refusal without guessing. `get_price(representation_id)` returns the stored record with `simulated` and `source`.

## Consequences

- A guarded pair needs a running price publisher. In the demo that is the simulator through a relayer; if it stops, a `fail_closed` pair stops converting, which is the intended failure.
- A relationship created before this ADR is unguarded until a `compat_approver` sets a guard. The seed does that for the demo pairs.
- The breaker cannot be reset by the account that proposed the relationship or by the one that tripped it, but one operator holding several roles can still use two accounts. Role separation is enforced in phase 3.
- The 256-bit comparison is a small hand-written routine (a widening `u128` multiply), not a new dependency, to keep the wasm small. It is covered by property tests against a `u128`-only reference on inputs that fit.
- Quotes bound to `fee_bps` already carry the skew, so there is no new signed field and no quote version bump. `packages/quote-engine` gains the fee function and the shared vectors.
