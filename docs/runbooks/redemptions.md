# Redemptions

A holder sends a reserve-backed token to the core with `redeem:{terms_hash}:{payout_instruction_hash}`; the core escrows it and the issuer's back office accepts, rejects or fulfils ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md) section 7). Nothing is paid out in this demo. Every call needs 1 yoctoNEAR.

## Set the terms (registrar)

```bash
near call $CORE set_redemption_terms '{"representation_id":"tgold-a","terms":{"min_amount":"1000000","max_amount":"0","fee_bps":25,"window_anchor_ms":0,"window_length_ms":0,"window_period_ms":0,"accept_within_ms":86400000,"settlement_days":3}}' --accountId $REGISTRAR --depositYocto 1
near view $CORE get_redemption_terms '{"representation_id":"tgold-a"}'
```

Each change raises `version` and changes `terms_hash`; a transfer quoting the old hash is refused and returns. The token must have core as its minter, or a fulfilment cannot burn ([reserves runbook](reserves.md)).

## Work the queue (issuer back office)

`near view $CORE get_redemptions_by_representation '{"representation_id":"tgold-a","from_index":0,"limit":50}'` lists requests oldest first. The back office is an account in the issuer's `controlled_accounts`.

| Step                                    | Call                                                    | Notes                                                                                                         |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Accept before `accept_deadline_ms`      | `accept_redemption {"id":1}`                            | Starts the fulfil clock: `settlement_days` from now                                                           |
| Reject (not a miss; works while paused) | `reject_redemption {"id":1,"reason":"KYC_FAILED"}`      | Only before the current deadline; the user then reclaims                                                      |
| Fulfil before `fulfil_deadline_ms`      | `fulfil_redemption {"id":1,"evidence_hash":"<64 hex>"}` | Burns the escrow through the token; status is `fulfilled` at once and returns to `accepted` if the burn fails |

## When a request is stuck

| Symptom                                     | Meaning                                                    | Do                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `requested` or `accepted` past its deadline | The issuer missed it                                       | Anyone calls `expire_redemption`; the miss is counted. The user calls `reclaim_redemption` (it expires first)      |
| `fulfilled` with `settling: true`           | The burn is in flight                                      | Wait one block; `redemption_fulfil_failed` means the burn failed and the request is `accepted` again               |
| `reclaimed` with `settling: true`           | The return is in flight                                    | Wait; `redemption_reclaim_failed` restores `rejected` or `expired`, and the user retries                           |
| The ledger disagrees                        | `held` is not `open_amount`, or the token balance is short | Treat as an incident: pause ([pause runbook](pause.md)) and compare `get_escrow_ledger` with `ft_balance_of(core)` |

`near view $CORE get_escrow_ledger '{"representation_id":"tgold-a"}'` must satisfy `escrowed_in = burned + returned + held` and `held = open_amount`; the core's token balance must cover vault inventory, pending conversion input and `held`.

## Reliability

`get_issuer_reliability` returns counters (requested, accepted, fulfilled, rejected, expired, misses by kind, latency totals). The API derives the score and labels it `simulated`.
