# Failed payout and refund

The contract debits inventory and marks the nonce used before it pays. If the payout to the user fails, it restores the inventory and returns the whole input ([ADR 0007](../decisions/0007-conversion-via-ft-transfer-call.md)).

## Symptoms

- A conversion ends `FAILED` with `failureReason` `PAYOUT_FAILED`, and a `conversion_failed` event.
- The user paid TGOLD-A and did not receive TGOLD-B.

## Confirm

```bash
curl -s $API/v1/transactions/$CONVERSION_ID | jq '{state, failureReason, events: [.events[].eventName]}'
```

Check the user's TGOLD-A balance (it should be back to what it was) and the vault:

```bash
pnpm --filter @pontis/scripts ops status        # inventory and held tokens should match for both tokens
```

## Usual cause

The user is not registered on TGOLD-B, so the token refused the payout. The API's plan puts a `storage_deposit` first when the account is unregistered; a wallet that skipped it, or an account unregistered between quote and execution, fails here.

## Do

1. If the user's input is back and the vault matches: nothing to repair. The user registers on TGOLD-B and converts again with a new quote (the nonce stays used).
2. If the input did **not** come back, or `ops status` shows inventory above the tokens the core holds: stop conversions with the [pause procedure](pause.md) and keep the transaction hash. The reconciler reports this as `VAULT_INSOLVENT` (critical) after two runs.
3. Withdraw nothing and fund nothing until the cause is understood.

## Done when

The user holds their input again, or has their output after a retry, and `ops status` shows inventory equal to the tokens the core holds.
