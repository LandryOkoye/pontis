# Runbooks

For the person operating a Pontis deployment on testnet. Each runbook gives the symptom, how to confirm it, what to do, and how to know it worked. Commands assume the deployer key is configured ([local setup](../local-setup.md)) and `API` and `ADMIN_API_KEY` are set.

| Situation                                                    | Runbook                                      |
| ------------------------------------------------------------ | -------------------------------------------- |
| A user's quote expired, or a transaction came back refused   | [Expired quote](expired-quote.md)            |
| The payout failed and the input came back                    | [Failed payout and refund](failed-payout.md) |
| A conversion never settles                                   | [Stuck submission](stuck-submission.md)      |
| Quotes say `INSUFFICIENT_INVENTORY`, or the reconciler warns | [Vault low](vault-low.md)                    |
| Something is wrong and conversions must stop                 | [Pause procedure](pause.md)                  |

First look, always:

```bash
pnpm --filter @pontis/scripts ops status                                  # chain: paused, fee, signer, inventory, route
curl -s $API/v1/health | jq                                               # database, rpc, chain height, indexer state and lag
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" $API/v1/admin/reconciliation | jq   # findings and flagged quotes
```

Roles on chain: `owner` funds and unpauses, `pauser` pauses and suspends, `compat_approver` re-approves ([ADR 0003](../decisions/0003-admin-roles-and-pause.md)). On the MVP deployment the deployer holds all of them.
