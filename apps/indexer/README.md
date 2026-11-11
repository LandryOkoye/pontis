# @pontis/indexer

Follows `pontis-core` on NEAR and settles conversions in Postgres. It is the only writer of `settlement_events` and of the `SETTLED`, `FAILED` and `REQUIRES_RECONCILIATION` quote states. Design: [ADR 0011](../../docs/decisions/0011-indexer.md).

## Run

```bash
pnpm db:up
cp .env.example .env   # or export the variables below
pnpm --filter @pontis/indexer start
```

The indexer applies migrations on start, so it can run before or after the API.

| Variable                                                    | Default        | Meaning                                                                                                                              |
| ----------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                              | required       | Postgres                                                                                                                             |
| `PONTIS_CORE_ACCOUNT_ID`                                    | required       | The core contract to follow                                                                                                          |
| `NEAR_RPC_URL`                                              | required       | A node with `EXPERIMENTAL_light_client_proof`; use an archival node to catch up over days. Example: `https://test.rpc.fastnear.com`  |
| `NEAR_NETWORK_ID`                                           | `testnet`      | `testnet` or `sandbox`. The indexer refuses to start if the node serves another chain                                                |
| `INDEXER_START_HEIGHT`                                      | the chain head | First block when there is no cursor. Set it to the deployment block to backfill                                                      |
| `INDEXER_POLL_MS`                                           | `2000`         | Pause between passes once caught up                                                                                                  |
| `INDEXER_RESCAN_BLOCKS`                                     | `30`           | Blocks read again behind the cursor on start                                                                                         |
| `INDEXER_CHUNK_CONCURRENCY`                                 | `4`            | Parallel chunk reads; matters only without shard detection                                                                           |
| `RESERVE_MONITOR_INTERVAL_MS`                               | `60000`        | Pause between reserve monitor passes; `0` turns the monitor off                                                                      |
| `RESERVE_MONITOR_ACCOUNT_ID`, `RESERVE_MONITOR_PRIVATE_KEY` | unset          | A throwaway testnet account that signs `refresh_supply` and `evaluate_reserve`. Both or neither; without them the monitor only reads |

## What it writes

- `settlement_events`: every `EVENT_JSON` log of every successful core receipt, unique by `(receipt_id, log_index)`. Events that name a quote's nonce are linked to its conversion.
- `quotes.state` and `conversions`: `SETTLED` or `FAILED` from the conversion events; `REQUIRES_RECONCILIATION` (and an `audit_log` row) when the chain disagrees with the quote.
- `conversions.tx_hash` / `settlement_events.tx_hash`: only after a reported hash is verified against the chain (see below); never copied from what the wallet reported.
- Mirror tables of [ADR 0020](../../docs/decisions/0020-custody-reserves-and-redemption.md) (see below).
- `indexer_cursor`: the last block fully applied. `GET /v1/health` reports `indexerLagBlocks` from it.
- `indexer_cursor`: the last block fully applied. Its `updated_at` is also the heartbeat: it is stamped when a block is applied and when a pass succeeds with nothing new, never by a failed pass. The API's `GET /v1/health` reads the lag and the heartbeat age from it and reports `never_run`, `running`, `lagging` or `stale` ([API health](../api/README.md#health)).

## Reported transaction hashes

After each pass the indexer verifies the hashes wallets reported for conversions that now have an outcome event. It asks `NEAR_RPC_URL` for the transaction and checks signer, receiver, `ft_transfer_call` arguments, quote nonce and that the transaction produced one of the outcome receipts. `VERIFIED` fills `conversions.tx_hash` and the events' `tx_hash`; a contradiction sets `REJECTED` and writes an `audit_log` row (`conversion.tx_hash_rejected`); an unknown hash or an unreachable node leaves `REPORTED` and is logged and retried about once a minute. Without a report a conversion settles with no verified hash.

## Custody, reserves and redemption mirror

Every new event of ADR 0019 and 0020 is applied, in the same transaction as its block, to a mirror table, only when the event was newly stored in `settlement_events`, so a replayed block (the start-up rescan) changes nothing and an old block cannot undo a newer state. Tables that keep one row per event also carry a unique `(receipt_id, log_index)`.

| Events                                                                                                                                                          | Tables                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `signer_key_added`, `signer_key_removed`                                                                                                                        | `signer_keys` (a removed key keeps its row)                                                        |
| `custodian_registered`, `custodian_status_changed`, `custodian_key_set`, `custody_linked`                                                                       | `custodians`, `custody_links`                                                                      |
| `reserve_policy_set`, `reserve_attested`, `reserve_supply_read`, `reserve_status_changed`                                                                       | `reserve_policies`, `reserve_attestations` (all history), `reserve_supply_reads`, `reserve_status` |
| `mint_requested`, `mint_completed`, `mint_failed`, `mint_cancelled`                                                                                             | `mint_requests`                                                                                    |
| `redemption_terms_set`, `redemption_requested`, `redemption_accepted`, `_rejected`, `_fulfilled`, `_fulfil_failed`, `_expired`, `_reclaimed`, `_reclaim_failed` | `redemption_terms` (every version), `redemptions`, `redemption_events`, `issuer_reliability`       |

`redemption_refused` and every other event are only stored in `settlement_events`. A known event whose payload does not match its schema is skipped and written to `audit_log` as `mirror.event_unreadable`; indexing goes on.

Some rows need the chain after the event. `custodian_registered` carries only the id and the key, redemption events change the issuer's counters, and a status change leaves the reserve snapshot behind. Those rows are marked (`needs_refresh`, or `chain_refreshed_at` older than `changed_at`) and completed from `get_custodian`, `get_issuer_reliability` and `get_reserve_status` at the end of each pass; a failed read leaves the mark and is retried. Fields not yet read are null (a custodian's name) or labelled `simulated: true` with no sources.

### Reserve monitor

Once per `RESERVE_MONITOR_INTERVAL_MS` the monitor takes every representation with a row in `reserve_policies`, calls `refresh_supply` then `evaluate_reserve` as the monitor account (when configured), reads `get_reserve_status`, and stores one report in `reserve_monitor_report`: `ranAt`, `signer`, per-representation `state`, `attestedUnits`, `circulatingUnits`, `limitUnits`, `ratioBps`, `ageMs`, whether each call worked, `simulated` and `sources`, and the lists `breaches`, `stale` and `failed`. A breach or staleness new since the previous pass is written to `audit_log` (`reserve.breach`, `reserve.stale`). It decides nothing: the contract computes the status. The query for the admin endpoint (`GET /v1/admin/reserve-monitor`, built with the session and role task) is `loadReserveMonitorReport(db)` in `@pontis/db`.

## Reconciler

Every `RECONCILE_INTERVAL_MS` (60 s; 0 turns it off) the reconciler compares the database with the chain and stores a report that `GET /v1/admin/reconciliation` serves ([ADR 0012](../../docs/decisions/0012-reconciliation.md)). It never writes to the chain.

| Finding                    | Meaning                                                                                                                     | Typical remedy                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `STUCK_SUBMITTED`          | No outcome event `RECONCILE_STUCK_AFTER_MS` after the hash was reported; the quote is now flagged                           | Look the transaction up in an explorer; it settles by itself if the event shows                                   |
| `SETTLED_WITHOUT_EVENT`    | A settled quote has no completion event stored                                                                              | Check the indexer cursor and the receipt on chain                                                                 |
| `COMPLETION_NOT_SETTLED`   | A completion event is stored but the quote is not settled                                                                   | Compare quote state and event; correct by hand                                                                    |
| `SETTLEMENT_MISMATCH`      | A settled quote's event shows another user or amount                                                                        | Treat as an incident: compare the receipt with the quote                                                          |
| `VAULT_INSOLVENT`          | Inventory exceeds the tokens the core holds (two runs in a row)                                                             | Stop converting that pair; investigate the token transfers                                                        |
| `VAULT_UNTRACKED_BALANCE`  | The core holds more tokens than inventory records (a direct transfer)                                                       | No contract method recovers it; see the [vault runbook](../../docs/runbooks/vault-low.md)                         |
| `CORPORATE_ACTION_OVERDUE` | An approved action with a multiplier change took effect over 10 minutes ago and a live wrapper has not applied it (warning) | Apply the action to that wrapper (`apply_corporate_action`); see ADR 0017                                         |
| `RESERVE_BREACH`           | The contract says a monitored representation is breached and the mirror has not recorded it (two runs; critical)            | Check the cursor and `reserve_status`; see the [reserves runbook](../../docs/runbooks/reserves-and-redemption.md) |
| `RESERVE_STALE`            | A monitored representation's attestations are older than its policy allows (warning)                                        | Start `reserves publish --loop`; see the reserves runbook                                                         |
| `REDEMPTION_OVERDUE`       | A redemption is still requested or accepted over 5 minutes past its deadline (warning)                                      | Anyone may `expire_redemption`; the user then reclaims                                                            |
| `ESCROW_MISMATCH`          | Open redemption escrows, inventory and pending input differ from the core's token balance (two runs)                        | Compare `get_escrow_ledger` with the open redemptions                                                             |

## Operating notes

| Symptom                                         | Cause and remedy                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `indexerLagBlocks` grows, log repeats one error | The node cannot serve one block or proof. Failures retry with pauses up to 60 s; read the logged error. A different RPC node usually fixes it.                                                          |
| `HistoryUnavailableError`                       | The cursor is older than the node's retention (the sandbox keeps minutes, public testnet days). Use an archival node, or `delete from indexer_cursor` and set `INDEXER_START_HEIGHT` to accept the gap. |
| Quote is `REQUIRES_RECONCILIATION`              | The chain executed a quote the API had not accepted or had expired, or amounts differ. `audit_log` has the reason and receipt. The reconciler (B13) resolves it.                                        |
| A conversion has no `txHash`                    | No report yet (`POST /v1/conversions/{id}/submitted` works any time), or `txHashStatus` is `REPORTED` (node did not know it; see log) or `REJECTED` (not its transaction).                              |

Stop with `SIGINT` or `SIGTERM`; it finishes the block in progress.

## Limits

- It reads only the shard that holds the core account. If the account moves shards (resharding) the layout cache refreshes within ten minutes.
- It does not apply registry events; the API's registry sync owns those tables.
- Receipts a node cannot prove stall the indexer rather than being skipped.
