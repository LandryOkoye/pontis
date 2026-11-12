# Price guards

A guarded pair converts only while the market prices of its two assets agree with the approved ratio ([ADR 0016](../decisions/0016-price-reference-and-route-guards.md)). The demo has no real market, so the prices come from the simulator and are labelled `simulated: true` on chain, in the API and in the UI. Nothing here makes a price real.

## Set up (once per deployment)

```bash
pnpm --filter @pontis/scripts guards register-publisher     # the dev price-publisher key; owner only
pnpm --filter @pontis/scripts guards set-guard tgold-a tgold-b   # compat approver; bumps the pair's version
pnpm --filter @pontis/scripts guards publish --loop 30       # keep prices fresh; run it as a service
pnpm --filter @pontis/scripts guards status                  # breakdown, prices and breaker
```

The preset (`scripts/lib/guard-ops.ts`) allows 150 bps of deviation, trips after 3 violating evaluations or at 500 bps, closes the route when a price is older than 90 seconds, refuses inputs under 1,000 smallest units and adds up to 50 bps of fee as the vault drains. The simulator's two gold wrappers stay within about 35 bps of each other, so the route is open in normal times.

`guards publish` signs the simulator's price in force now, as of now, for the configured core account. The feed steps every five minutes; signing the observation time as the relay time is a simulation shortcut (see [known limitations](../known-limitations.md)).

## When the route is closed

`GET /v1/routes/tgold-a/tgold-b/guards?amount=1000000` lists every check and why it failed; a quote carries the same reason code.

| Reason code                                                     | Meaning                                     | Do                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `PRICE_STALE`, `PRICE_UNAVAILABLE`                              | A price is too old, missing or out of range | Check that `guards publish` runs and the key is registered; the route reopens with the next price |
| `PRICE_DEVIATION`                                               | The prices disagree beyond the guard        | Wait, or investigate; do not widen the guard to make a refusal go away                            |
| `RELATIONSHIP_SUSPENDED`                                        | The circuit breaker tripped                 | Reset it (below)                                                                                  |
| `AMOUNT_BELOW_MIN`, `AMOUNT_ABOVE_MAX`, `WINDOW_LIMIT_EXCEEDED` | The amount is outside the pair's limits     | Quote a different amount or wait for the window                                                   |

## Reset a tripped breaker

A breaker reopens only when the guard passes again, and only a compat approver who neither proposed the relationship nor caused the trip may reset it. On the demo that is a second account with the `compat_approver` role:

```bash
near contract call-function as-transaction <core> reset_circuit_breaker \
  json-args '{"representation_a_id":"tgold-a","representation_b_id":"tgold-b","rationale":"prices agree again"}' \
  prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as <second-approver> network-config testnet
```

The reset bumps the pair's version, so quotes signed before it are refused (`COMPATIBILITY_CHANGED`).

## Rotate or revoke the publisher key

The owner adds the new key, waits for a price from it, then removes the old one (`add_price_publisher_key`, `remove_price_publisher_key`). Several keys may be registered at once.
