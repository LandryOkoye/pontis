# ADR 0020: Oracle-anchored market-pool pricing

- **Status:** Proposed
- **Date:** 2026-11-11
- **Brief items:** expansion brief §7.1–7.3 (Workstream E)
- **Related:** [0010 deferred scope](0010-deferred-scope.md)

## Context

The MVP's fixed parity ratio and owner-funded vault cannot price an `ECONOMICALLY_SIMILAR` route. Phase 5 needs a deterministic market-priced pool rule which exposes price impact and can be reproduced by the quote service, contract, API, simulator and test suite. It must never treat a simulated price as real, and it must fail closed when the calling route's price attestation is missing or stale.

## Decision

`packages/quote-engine/src/pool.ts` defines the initial pure calculation. It uses only positive integer smallest-unit amounts and checked `u128` intermediates. Let `p` be the fresh signed reference price in quote smallest units per base smallest unit, `x` the input amount, `R_in` and `R_out` the pool reserves, and `f` the fee in basis points:

```text
input_value = floor(x * p)
depth       = min(R_out, floor(R_in * p))
before_fee  = floor(input_value * depth / (depth + input_value))
fee         = ceil(before_fee * f / 10_000)
amount_out  = before_fee - fee
impact_bps  = ceil(input_value * 10_000 / (depth + input_value))
```

The `depth` definition makes the smaller marked side govern the trade. At a small size, `before_fee` approaches the oracle mid output; as a trade becomes material relative to depth, its output degrades monotonically and remains strictly below the output reserve. This is oracle-anchored depth impact, not a standalone AMM price discovery mechanism.

Pool fees are capped at 1,000 bps. The quote carries the calculated price impact, fee and a user-selected `min_amount_out = floor(amount_out * (10_000 - max_slippage_bps) / 10_000)`. Execution recomputes every value and refuses an output below `min_amount_out`; a route never quotes without a fresh attestation. The quote-engine does not determine freshness, source or simulated status: the price adapter and API must propagate `source` and `simulated` on every quote.

`test-vectors/market-pool-math.json` is the initial cross-language fixture. The eventual Rust pool implementation must consume the same vectors before this primitive is used in a state-changing contract method.

## Consequences

- This introduces no pool state, token transfers, routes or public API endpoint; it is a Phase 5 foundation and leaves the MVP parity path unchanged.
- A deep but badly imbalanced pool is conservatively limited by the lower marked reserve. LP share accounting, deposit/withdrawal callbacks, skew fees, pool caps and multi-source selection remain subsequent Phase 5 slices.
- The algorithm uses a reference price and therefore inherits its trust assumptions. The demo price feed is explicitly simulated; its resulting quotes and chart data must remain labelled `simulated: true`.
