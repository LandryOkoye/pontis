# Phase 2 report: price reference and route guards (contract)

Implements [ADR 0016](../decisions/0016-price-reference-and-route-guards.md) in `contracts/pontis-core`. Corporate actions and lifecycle ([0017](../decisions/0017-corporate-actions-and-multiplier-epochs.md), [0018](../decisions/0018-asset-lifecycle-and-nav-strikes.md)) are a separate branch.

## What shipped

| Piece                                                                                              | Real, testnet or simulated                                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `price_publisher` keys, `submit_price` with an ed25519-verified Borsh payload (`pontis-price-v2`)  | Real on-chain verification. The only producer in the demo is the simulator, signing with a published dev key |
| `RouteGuard` per pair, the 256-bit deviation check, stale and missing price policy                 | Real on-chain logic                                                                                          |
| Per-transaction limits and a tumbling window                                                       | Real on-chain logic                                                                                          |
| Inventory reference and the quadratic fee skew folded into the signed quote's `fee_bps`            | Real on-chain logic                                                                                          |
| Circuit breaker: trip at price submission or on a refused conversion, reset by a distinct approver | Real on-chain logic                                                                                          |
| `get_route_guards` view                                                                            | Real read                                                                                                    |
| `test-vectors/price-attestation.json` (Rust, TypeScript and an independent Python rebuild agree)   | Test data                                                                                                    |

## Verification

- `cargo test -p pontis-core`: 246 unit and property tests pass; `cargo clippy --all-targets -D warnings` and `cargo fmt --check` are clean.
- Shared vectors: `test-vectors/route-guard.json` (deviation, skew, effective fee, limits; computed with unbounded Python integers and the documented 256-bit refusal rules) is reproduced by Rust (`guard_vector_tests.rs`) and TypeScript (`@pontis/quote-engine`, 75 tests). `test-vectors/price-attestation.json` is reproduced by Rust and an independent Python Borsh and ed25519 rebuild; the TypeScript attestation (`@pontis/market-data`) moves to this layout on the mirror branch.
- Sandbox (`contracts/integration-tests/tests/guards.rs`, real wasm): parity prices open a guarded pair and a conversion settles; a deviating price closes it with `price_deviation`; refused conversions return the input and trip the breaker; the proposer cannot reset it, the second approver can only after prices recover; the reset voids older quotes (`COMPATIBILITY_CHANGED`); the skew fee equals an independent calculation and a quote with the old fee is refused (`FEE_CHANGED`); minimum and maximum are refused with their own reasons; an unguarded pair ignores prices. A host panic shows as a wasm trap in the sandbox, so refusal wording is asserted in unit tests.

## Open risks

- **A guarded pair needs a live publisher.** If the simulator or relayer stops, a `fail_closed` pair stops converting. That is the intended failure and it shows on the status page.
- **One operator can still hold several roles.** The breaker reset refuses the proposer and the triggering account, not an operator's second account. Role separation is phase 3.
- **Prices are as trustworthy as the publisher.** The contract bounds staleness and deviation, not correctness. A compromised publisher key can trip breakers (denial of service) or, with a matching ratio, hide a real deviation; the owner removes the key.
- **The window is tumbling, not rolling**, so up to twice the limit can pass across a boundary.
- **Intermediate commits of this branch do not all build.** New modules were added before the commit that wires them in (`lib.rs`, events, route and conversion changes). The branch head builds and passes.
