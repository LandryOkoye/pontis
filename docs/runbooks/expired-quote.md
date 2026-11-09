# Expired quote

A quote lives 60 seconds. The contract enforces it, so nothing is lost when one expires; it only has to be repeated.

## Symptoms

- `POST /v1/conversions` answers `410 QUOTE_EXPIRED`, or the wallet's transaction came back with the input refunded.
- A transaction in `GET /v1/transactions/{id}` shows a `conversion_rejected` event with reason `QUOTE_EXPIRED` and state `EXPIRED`.

## Confirm

```bash
curl -s $API/v1/transactions/$CONVERSION_ID | jq '{state, events: [.events[] | {eventName, data}]}'
```

The user's token balance is the input amount again. If it is not, go to [failed payout and refund](failed-payout.md).

## Do

1. Tell the user to request a new quote and sign promptly. Nothing needs repairing.
2. If many users hit it, check the clocks: the API stamps `expiresAt` from its clock and the contract compares block time. A drift of more than a few seconds on the API host shortens or lengthens every quote. Fix the host clock.
3. If a transaction was **executed** after the API already marked the quote `EXPIRED` (the funds moved), the quote becomes `REQUIRES_RECONCILIATION`. Treat it as a [stuck submission](stuck-submission.md) whose transaction succeeded.

## Done when

The new quote settles, or the refused transaction shows the input back in the user's balance.
