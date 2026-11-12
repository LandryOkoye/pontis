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
| `tests/actions.rs`    | A split closes the pair and voids old quotes when both wrappers apply; NAV strike windows; `no_conversion` and delisted refusals; an unconfigured asset as the MVP                        |

## Pending inventory (`tests/pending_inventory.rs`)

TGOLD-B is replaced by `contracts/mock-payout-token`, a test-only token whose payout (`ft_transfer`) stays unresolved until the test calls `release`, as a success or a failure (NEP-519 yield/resume). That holds a conversion in its "input held, payout pending" state for as long as the test needs, with no reliance on block timing, while TGOLD-A, `pontis-core`, `on_payout_resolved` and `ft_resolve_transfer` are the real contracts. Tests cover:

- a withdrawal of the pending input is refused, only genuine inventory can be withdrawn, and a failed payout then refunds Alice in full;
- a reverse conversion cannot spend the pending input (`INSUFFICIENT_INVENTORY`), and the refund is complete;
- a settled input becomes spendable (a reverse conversion and a withdrawal then work);
- several conversions in flight settle independently (one succeeds, one fails) and leave `balance == inventory + pending`.

Run against the pre-fix contract, the reverse-conversion test fails because Bob's conversion completes out of Alice's pending input, and Alice's refund comes back as 1,000 of 1,000,000.
