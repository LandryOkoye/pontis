# Phase 4 report: custody, reserves and the gated mint (contract)

Implements [ADR 0020](../decisions/0020-custody-reserves-and-redemption.md) sections 2 to 6 in `contracts/pontis-core` and `contracts/synthetic-token`, on top of the role registry of [phase 3](phase-3-roles.md). The redemption lifecycle (section 7) is reported in its own section below.

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

## Redemption (ADR 0020 section 7)

| Piece                                                                                                                                               | Real, testnet or simulated                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `set_redemption_terms`: structured terms (minimum, maximum, fee, window, accept SLA, settlement days), versioned, hashed (`pontis-redeem-terms-v1`) | Real on-chain logic                               |
| `ft_on_transfer` with `redeem:{terms_hash}:{payout_instruction_hash}`: escrow, terms enforcement, snapshot, 20 open requests per user               | Real on-chain logic                               |
| `accept_redemption`, `reject_redemption`, `fulfil_redemption` (burn through `minter_burn`), `expire_redemption`, `reclaim_redemption` (return)      | Real on-chain logic; the issuer is a test account |
| Escrow ledger `get_escrow_ledger` and the conservation invariant; issuer reliability counters                                                       | Real on-chain logic                               |
| `test-vectors/redemption-terms.json` (hash, windows, fees, message grammar; independent Python, reproduced by Rust)                                 | Test data                                         |

Verification: unit tests for every transition and refusal, both callbacks (success and failure), the conservation invariant after every step of a mixed run, the pause behaviour (reject and reclaim work while paused, requests do not), and the shared vectors. Sandbox (`contracts/integration-tests/tests/redemption.rs`, real wasm): a redemption is accepted and fulfilled and the escrow is burned (supply and ledger fall); a rejected request returns the escrow on reclaim; an unanswered request expires with a counted miss and the user reclaims; stale terms, a below-minimum amount and a malformed message are refused and return the transfer; after every step the core's token balance equals vault inventory plus pending input plus held escrow.

Judgement calls:

- **The message carries two hashes.** The brief's `redeem:{terms_hash}` cannot carry the payout instruction hash in the same atomic transfer, so the grammar is `redeem:{terms_hash}:{payout_instruction_hash}`.
- **Reclaim is a pull for rejections too.** A rejected request waits for the user to reclaim, so a user who unregistered from the token cannot make the issuer's call fail; a failed return restores the status and can be retried.
- **`settling` is an extra field of `Redemption`.** It marks a burn or return in flight so the escrow ledger counts it as held until the token call is confirmed.
- **Settlement is in whole days.** The fulfil deadline is therefore exercised in unit tests only; the sandbox covers the accept deadline (minimum 1 second).
- **A late issuer cannot reject its way out of a miss.** Reject needs the current deadline not to have passed.

Open risks: see threats T90 to T94. The escrow depends on the token accepting `minter_burn` and `ft_transfer`; a failing token strands it until it works.
