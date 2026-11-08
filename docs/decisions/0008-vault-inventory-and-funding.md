# ADR 0008: Vault inventory and funding model

- **Status:** Accepted
- **Date:** 2026-11-07
- **Brief items:** §7.2, §24 items 3 and 8, §13.4
- **Related:** [0003](0003-admin-roles-and-pause.md), [0007](0007-conversion-via-ft-transfer-call.md)

## Context

Brief §7.2 says to use a controlled, pre-funded test vault rather than an AMM for the first demonstration, and §24 asks who funds inventory and how it is replenished.

## Decision

### Conversion model

Inventory-based: the vault holds balances of each registered representation inside `pontis-core`. A conversion adds `amount_in` to the input token's inventory and removes `net` from the output token's inventory. There is no AMM, no pricing curve and no imbalance fee. The protocol fee (`gross - net`) stays in the output token's inventory.

### Funding

1. **Who funds:** the project operator, i.e. the `owner` account. On testnet the owner mints TGOLD-A and TGOLD-B to itself with the tokens' owner-only `mint` and then funds the vault.
2. **How:** `ft_transfer_call` on the token with `receiver_id = pontis-core` and `msg = "fund_vault"`. `pontis-core` credits inventory only if `sender_id` is the `owner` and the token is a registered representation. Any other sender's transfer is refunded in full. Emits `vault_funded`.
3. **Withdrawal:** owner-only `withdraw_inventory(representation_id, amount, receiver_id)`, which debits inventory first, then calls `ft_transfer` with a callback that restores inventory on failure. Emits `vault_withdrawn`.
4. **Direct token transfers** to `pontis-core` made with plain `ft_transfer` (no `ft_on_transfer`) are not credited to inventory. They show up as a mismatch in reconciliation (BuildPlan B13) and are recovered by an owner action documented in the runbook.
5. **Accounting invariant:** `inventory[rep] <= ft_balance_of(pontis-core, rep)` at all times; the reconciler compares them and flags drift.

### Replenishment

- Manual, via `scripts/fund-vault`. The reconciler reports each representation's inventory; a "vault low" runbook entry defines the threshold and the steps. There is no automated rebalancing.
- Quotes are refused with `INSUFFICIENT_INVENTORY` when inventory cannot cover `net`; this is the honest no-route response (brief §26, low liquidity).

## Consequences

- Imbalance is expected: users converting mostly A to B drain B inventory. That is visible in the UI and handled by the operator.
- Only the owner can add inventory, so inventory accounting cannot be polluted by arbitrary senders.
- The faucet is for demo users' wallets only; the vault is funded by the owner, not the faucet, so faucet caps do not limit vault size.

## Amendments (B7)

- A non-owner `fund_vault` is returned in full and emits `conversion_rejected` with `NOT_OWNER`; a transfer from an unregistered token is returned with `UNKNOWN_TOKEN`. Funding is allowed while the contract is paused.
- `withdraw_inventory` debits first, pays with `ft_transfer`, and `on_withdraw_resolved` restores the inventory if the transfer failed. `vault_withdrawn` carries `success` so the indexer can tell the two outcomes apart.
- Inventory addition is checked: a funding or conversion that would overflow `u128` is refused.
