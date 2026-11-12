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

## Through the API (session endpoints)

The web app and the back-office use the session endpoints of [ADR 0020](../decisions/0020-custody-reserves-and-redemption.md) section 10; they return unsigned actions and sign nothing. To check one by hand, sign in ([operator sign-in](auth.md)) and call it with the bearer token:

```bash
curl -s -X POST $API/v1/redemptions/prepare -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"representationId":"tgold-a","amount":"5000000","payoutInstruction":"<base64 ciphertext>","termsHash":"<64 hex>"}' | jq
curl -s -H "Authorization: Bearer $BO_TOKEN" "$API/v1/issuer/redemptions?status=requested" | jq
curl -s -X POST -H "Authorization: Bearer $BO_TOKEN" $API/v1/issuer/redemptions/1/accept | jq   # unsigned accept_redemption
```

| Symptom                                          | Meaning                                                                                                    | Do                                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `403 FORBIDDEN` on an issuer endpoint            | The account is not in `controlled_accounts` of the asset's active issuer (the API reads it from the chain) | The registrar lists the back-office account when registering the issuer ([reserves and redemption](reserves-and-redemption.md)) |
| `409 STATE_CONFLICT`                             | Status, deadline or an in-flight token call forbids the step                                               | Read `GET /v1/redemptions/{id}`; an overdue request can only expire, then the user reclaims                                     |
| `422 MINT_REFUSED`                               | Above the attested headroom, `pause_mint` in force, or no reserve policy                                   | Get a fresh attestation ([reserves](reserves.md)), set a policy, or request less                                                |
| A redemption request came back to the user       | `redemption_refused` on chain; the indexer mirrors it in `redemption_refusals` with the contract's reason  | Read the reason (`TERMS_CHANGED`, `BELOW_MIN`, `WINDOW_CLOSED`, ...) and prepare again with current terms                       |
| `GET /v1/admin/reserve-monitor` says `NEVER_RUN` | The indexer's monitor has not finished a pass                                                              | Check the indexer; the report is the monitor's last pass, never a verdict on a reserve                                          |

The payout instruction is stored encrypted and unread. There is no way to read it back through the API, and a prepared instruction that never became a redemption stays in `redemption_payout_instructions` ([threat T100 to T102](../threat-model/mvp.md)).
