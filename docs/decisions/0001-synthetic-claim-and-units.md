# ADR 0001: Synthetic claim, units and pricing

- **Status:** Accepted; the immutability of `unit_multiplier` is superseded by [0017](0017-corporate-actions-and-multiplier-epochs.md)
- **Date:** 2026-11-07
- **Brief items:** §24 items 1, 2, 7
- **Related:** [0009](0009-synthetic-evidence-labelling.md)

## Context

The MVP must prove registration, assessment, quoting, conversion and reconciliation without touching a real asset. The claim needs an unambiguous unit so ratio and rounding behaviour can be tested exactly (brief §7.1).

## Decision

1. **Synthetic claim `SYN-GOLD-OZ`:** a synthetic, unbacked, test-only claim to one troy ounce of fictional allocated gold. It is stored as `synthetic: true, verified: false`.
2. **Two representations, both NEP-141 on NEAR Testnet:**

   |                                   | TGOLD-A            | TGOLD-B            |
   | --------------------------------- | ------------------ | ------------------ |
   | Issuer                            | Synthetic Issuer A | Synthetic Issuer B |
   | Decimals                          | 6                  | 8                  |
   | 1 whole token =                   | 1 canonical unit   | 0.1 canonical unit |
   | Unit multiplier per smallest unit | `1 / 10^6`         | `1 / 10^9`         |

3. **Pricing is the approved unit ratio only.** No price feed, NAV, spread or slippage. The approved ratio for A to B is `1000 / 1` in smallest units (1 A = 10 B). Cross-asset market pricing is deferred (see [0010](0010-deferred-scope.md)).
4. **Ratio derivation and consistency.** A relationship stores an explicit approved ratio `{num, den}` (output smallest units per input smallest unit, direction `a to b`; the reverse direction is the reciprocal). At approval time the contract rejects the relationship unless the stored ratio equals `multiplier_a / multiplier_b` computed from the two representations' multipliers. The approval is the authority; the multipliers are a consistency check. The brief (§6.6) requires that a multiplier alone never approves parity.
5. **Multipliers and decimals are immutable** once a representation is registered. Changing them requires registering a new representation.
6. **Fee and rounding.** `gross = floor(in * r_src / r_dst)`, `fee = ceil(gross * protocol_fee_bps / 10_000)`, `net = gross - fee`. Rounding always favours the protocol, so `net <= gross <= exact ratio output`. Default `protocol_fee_bps = 10`, hard cap `100` in the contract.
7. **Arithmetic:** `u128` in contracts, `bigint` in TypeScript, rationals as `{num, den}`. Contract products use `checked_mul`; an overflow rejects the conversion and refunds the input. No floating point anywhere in amount math.

## Consequences

- One shared set of test vectors (Rust and TypeScript) pins the math (BuildPlan B10).
- Dust conversions pay `ceil` fees, so splitting an amount into many small conversions never beats one large one.
- A multiplier typo is caught at approval, not at execution.

## Alternatives considered

- _Real-world-looking asset (T-bill, stock):_ rejected; implies backing the project does not have.
- _Equal decimals on both tokens:_ rejected; it would hide the unit-multiplier path that the MVP exists to test.
