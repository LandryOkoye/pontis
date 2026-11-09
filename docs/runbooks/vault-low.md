# Vault low

The vault holds only what the owner funded. When one side runs short, quotes in that direction are refused with `INSUFFICIENT_INVENTORY`: the honest answer, not an error.

## Thresholds

The seed funds TGOLD-A with 1,000 tokens (`1000000000`) and TGOLD-B with 10,000 (`1000000000000`). Treat a side as **low** below 20% of its seeded amount and refill to the seeded amount. Convert at the ratio when choosing how much: users converting A to B drain B and fill A.

## Symptoms

- `POST /v1/quotes` answers `422 INSUFFICIENT_INVENTORY`.
- `ops status` shows a small inventory for one token; `GET /v1/assets/{id}` shows `vaultInventory`.
- The reconciler warns `VAULT_UNTRACKED_BALANCE` or, worse, `VAULT_INSOLVENT` (below).

## Refill

```bash
pnpm --filter @pontis/scripts ops status
pnpm --filter @pontis/scripts ops fund-vault tgold-b 900000000000      # smallest units; mints to the owner, credits the vault
pnpm --filter @pontis/scripts ops status                               # inventory and held tokens both rose by the amount
```

Funding is allowed while paused. Only the owner can fund, and a funding that does not come from the owner is refused and returned.

## Take inventory back out

```bash
pnpm --filter @pontis/scripts ops withdraw tgold-a 500000000 owner.testnet
```

It debits inventory first and restores it if the transfer fails.

## Reconciler warnings about the vault

| Finding                   | Meaning                                                         | Do                                                                                                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VAULT_INSOLVENT`         | Inventory exceeds the tokens the core holds (two runs in a row) | The core owes tokens it does not have. [Pause](pause.md), find the transfer that moved tokens out, and keep the evidence. Do not fund until explained.                                                                                                                                    |
| `VAULT_UNTRACKED_BALANCE` | The core holds more tokens than its inventory records           | Someone sent tokens with a plain `ft_transfer`. The contract has no method to credit or sweep them, so they stay in the core and the warning stays until a redeploy ([ADR 0008](../decisions/0008-vault-inventory-and-funding.md)). They cannot be spent; it is surplus, not a shortfall. |

## Done when

Quotes in the starved direction work again, and the reconciler shows inventory equal to the held tokens (or only the known untracked surplus).
