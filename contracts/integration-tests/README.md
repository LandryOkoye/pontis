# pontis-integration-tests

`near-workspaces` sandbox tests that run the real contracts end to end: two `synthetic-token`s and `pontis-core`, registered, approved and funded as the seed script does. They exercise the parts unit tests cannot: the real `ft_transfer_call`, `ft_on_transfer`, payout and `ft_resolve_transfer` refund chain.

```bash
scripts/integration-tests.sh        # builds with cargo-near, then runs the tests
```

The first run downloads the NEAR sandbox binary. Set `PONTIS_WASM_DIR` to use wasm built elsewhere (default `target/near`).

| File                  | Covers                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/conversion.rs` | A signed quote converts 1 A to 10 B less the fee; balances, inventory and `conversion_completed` agree                                                                                    |
| `tests/failures.rs`   | Failed payout refunds the input and the quote cannot be replayed; expired, foreign, altered, suspended, paused, de-listed and under-funded cases are refunded in full; owner-only funding |
| `tests/gas.rs`        | Gas needed to complete a conversion, and that too little gas never loses funds                                                                                                            |
