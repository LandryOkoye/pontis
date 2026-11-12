# synthetic-token

A **SYNTHETIC TEST** NEP-141 token for NEAR Testnet. Unbacked, no value, no redemption. It is deployed twice for the MVP (TGOLD-A with 6 decimals, TGOLD-B with 8; see [`docs/asset-dossiers`](../../docs/asset-dossiers/)) and knows nothing about `pontis-core` ([ADR 0002](../../docs/decisions/0002-contract-layout-and-events.md)).

## Interface

Standard: NEP-141 (`ft_transfer`, `ft_transfer_call`, `ft_total_supply`, `ft_balance_of`, `ft_resolve_transfer`), NEP-145 storage management, NEP-148 metadata.

| Method                                                                                 | Caller                 | Notes                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new(owner_id, name, symbol, decimals, faucet_max_per_call?, faucet_cooldown_ms?)`     | deployer               | `name` must contain `SYNTHETIC TEST`. Owner is registered. Faucet defaults: 100 whole tokens per call, 1 hour cooldown, enabled.                        |
| `mint(account_id, amount)`                                                             | owner, 1 yocto         | Recipient must be registered.                                                                                                                           |
| `burn(amount)`                                                                         | owner, 1 yocto         | Burns from the owner's own balance only. No clawback.                                                                                                   |
| `pause()` / `unpause()`                                                                | owner, 1 yocto         | While paused, `ft_transfer`, `ft_transfer_call`, `mint`, `burn` and `faucet_mint` fail. `ft_resolve_transfer` still runs so in-flight refunds complete. |
| `set_faucet_config(enabled, max_per_call, cooldown_ms)`                                | owner, 1 yocto         | `enabled = false` turns the faucet off.                                                                                                                 |
| `faucet_mint(amount)`                                                                  | any registered account | At most `max_per_call`, once per `cooldown_ms` per account.                                                                                             |
| `set_minter(minter?)`                                                                  | owner, 1 yocto         | Sets or clears the only account that may create supply; while set, owner `mint` and the faucet fail (ADR 0020).                                         |
| `minter_mint(account_id, amount)`                                                      | minter, 1 yocto        | Recipient must be registered. `pontis-core` is the minter of a reserve-gated token and mints within the attested headroom.                              |
| `minter_burn(amount)`                                                                  | minter, 1 yocto        | Burns from the minter's own balance (the redemption escrow the core holds). No other balance can be burned.                                             |
| `owner_id()`, `is_paused()`, `faucet_config()`, `faucet_next_available_ms(account_id)` | view                   |                                                                                                                                                         |

Owner-only methods require exactly 1 yoctoNEAR so restricted access keys cannot call them.

## Events

NEP-141 `ft_mint` and `ft_burn` for supply changes. NEP-297 events with standard `pontis_synthetic_token`: `paused`, `unpaused`, `faucet_config_updated`, `faucet_minted`, `minter_set`.

## Known limits (testnet only)

- The faucet's per-account timestamp map is never pruned, and its storage is paid by the contract.
- A single owner key controls mint, pause and faucet. There is no ownership transfer or upgrade method; redeploy instead ([ADR 0003](../../docs/decisions/0003-admin-roles-and-pause.md)).
- Callers of `faucet_mint` and `mint` must be registered first (`storage_deposit`); wallets can batch both actions.

## Commands

```bash
cargo test -p synthetic-token              # unit tests
pnpm build:contracts                       # wasm via cargo-near (cargo install cargo-near --locked)
```

Sandbox integration tests (transfer-call, refund on failure) arrive with B8.
