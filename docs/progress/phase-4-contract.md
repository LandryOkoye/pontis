# Phase 4 report: custody, reserves and the gated mint (contract)

Implements [ADR 0020](../decisions/0020-custody-reserves-and-redemption.md) sections 2 to 6 in `contracts/pontis-core` and `contracts/synthetic-token`, on top of the role registry of [phase 3](phase-3-roles.md). The redemption lifecycle (section 7) is on the next branch and reported below once it lands.

## What shipped

| Piece                                                                                                                                                                                                                          | Real, testnet or simulated                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Custodian registry: `register_custodian`, `set_custodian_status`, `set_custodian_key`, `link_custody`, views                                                                                                                   | Real on-chain records; the one custodian in the demo is fictional                              |
| `submit_reserve_attestation`: ed25519 over `pontis-reserve-v1` (Borsh, bound to the contract), key checked against the custodian and the signer registry (scope `reserves`), newer-than and future checks, history ring of 500 | Real on-chain verification. The only signer in the demo is the simulator with a public dev key |
| `ReservePolicy` (tolerance, max age, action `warn` / `restrict_conversions` / `pause_mint`) and the status computed on read                                                                                                    | Real on-chain logic                                                                            |
| Supply: ledger of gate mints, `pending` mints, permissionless `refresh_supply` reading the token's `ft_total_supply`                                                                                                           | Real on-chain logic                                                                            |
| Route gate: `check_route` refuses `reserve_restricted` and `reserve_stale`; `get_route_guards` gains `reserves` lines                                                                                                          | Real on-chain logic                                                                            |
| Mint gating: `request_mint`, `execute_mint` (core is the token's `minter`), `on_mint_resolved`, `cancel_mint_request`, `get_mint_headroom`                                                                                     | Real on-chain logic; the back office is a test account                                         |
| `synthetic-token`: `set_minter`, `minter_mint`, `minter_burn`; owner `mint` and the faucet close while a minter is set                                                                                                         | Real token logic                                                                               |
| `test-vectors/reserve-attestation.json`, `test-vectors/reserve-status.json` (independent Python, reproduced by Rust)                                                                                                           | Test data                                                                                      |

## Verification

- `cargo test -p pontis-core` and `-p synthetic-token`: unit tests cover every custody transition and refusal, attestation acceptance and each refusal (contract, custodian, key, signer registry, replay, future, tampered figure, bad hash, pause), the history ring, the status arithmetic against the shared vectors, the route gate in both directions, the mint flow (reservation, success, failure, in-flight headroom, `pause_mint`, double execute) and the token minter.
- Sandbox (`contracts/integration-tests/tests/custody_reserves.rs`, real wasm): the back office mints within the attested headroom and is refused above it; supply above the reserves closes the route with `reserve_restricted` and a rejected conversion returns the input, a new attestation reopens it and the conversion settles; a stale attestation closes it with `reserve_stale`; forged, replayed, foreign-contract and unregistered-key attestations change nothing; supply minted outside the gate is found by `refresh_supply` and breaches the status.
- Refused calls are wasm traps in the sandbox, so those tests assert state; messages are asserted in unit tests.

## Judgement calls

- **The status is computed, not posted.** The brief has the monitor post a compact status. A posted status lets an off-chain job write a favourable one, so the contract derives it from signed attestations, its own ledger and the block time. The monitor only triggers `refresh_supply` and `evaluate_reserve`.
- **Mint through a minter, not a headroom read by the token.** See ADR 0020 section 6: a check followed by an unlocked mint lets two mints share one headroom; the core reserves the amount before the token call.
- **Policy is owner-only.** It changes the safety invariant, so it is a deliberate act and not a registrar edit.

## Open risks

- **Everything rests on the custodian key and the owner.** See threats T56 to T59.
- **The status event can lag.** Staleness changes with time; only `evaluate_reserve` emits it.
- **Supply made outside the gate is found only by a read.** The ledger cannot see it.
- **Intermediate commits of this branch may not build every target.** Modules were added before the commit that wires them in; the branch head builds and passes.
