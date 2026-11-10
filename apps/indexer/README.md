# @pontis/indexer

Follows `pontis-core` on NEAR and settles conversions in Postgres. It is the only writer of `settlement_events` and of the `SETTLED`, `FAILED` and `REQUIRES_RECONCILIATION` quote states. Design: [ADR 0011](../../docs/decisions/0011-indexer.md).

## Run

```bash
pnpm db:up
cp .env.example .env   # or export the variables below
pnpm --filter @pontis/indexer start
```

The indexer applies migrations on start, so it can run before or after the API.

| Variable                    | Default        | Meaning                                                                                                                             |
| --------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | required       | Postgres                                                                                                                            |
| `PONTIS_CORE_ACCOUNT_ID`    | required       | The core contract to follow                                                                                                         |
| `NEAR_RPC_URL`              | required       | A node with `EXPERIMENTAL_light_client_proof`; use an archival node to catch up over days. Example: `https://test.rpc.fastnear.com` |
| `NEAR_NETWORK_ID`           | `testnet`      | `testnet` or `sandbox`. The indexer refuses to start if the node serves another chain                                               |
| `INDEXER_START_HEIGHT`      | the chain head | First block when there is no cursor. Set it to the deployment block to backfill                                                     |
| `INDEXER_POLL_MS`           | `2000`         | Pause between passes once caught up                                                                                                 |
| `INDEXER_RESCAN_BLOCKS`     | `30`           | Blocks read again behind the cursor on start                                                                                        |
| `INDEXER_CHUNK_CONCURRENCY` | `4`            | Parallel chunk reads; matters only without shard detection                                                                          |

## What it writes

- `settlement_events`: every `EVENT_JSON` log of every successful core receipt, unique by `(receipt_id, log_index)`. Events that name a quote's nonce are linked to its conversion.
- `quotes.state` and `conversions`: `SETTLED` or `FAILED` from the conversion events; `REQUIRES_RECONCILIATION` (and an `audit_log` row) when the chain disagrees with the quote.
- `conversions.tx_hash` / `settlement_events.tx_hash`: only after a reported hash is verified against the chain (see below); never copied from what the wallet reported.
- `indexer_cursor`: the last block fully applied. `GET /v1/health` reports `indexerLagBlocks` from it.
- `indexer_cursor`: the last block fully applied. Its `updated_at` is also the heartbeat: it is stamped when a block is applied and when a pass succeeds with nothing new, never by a failed pass. The API's `GET /v1/health` reads the lag and the heartbeat age from it and reports `never_run`, `running`, `lagging` or `stale` ([API health](../api/README.md#health)).

## Reported transaction hashes

After each pass the indexer verifies the hashes wallets reported for conversions that now have an outcome event. It asks `NEAR_RPC_URL` for the transaction and checks signer, receiver, `ft_transfer_call` arguments, quote nonce and that the transaction produced one of the outcome receipts. `VERIFIED` fills `conversions.tx_hash` and the events' `tx_hash`; a contradiction sets `REJECTED` and writes an `audit_log` row (`conversion.tx_hash_rejected`); an unknown hash or an unreachable node leaves `REPORTED` and is logged and retried about once a minute. Without a report a conversion settles with no verified hash.

## Reconciler

Every `RECONCILE_INTERVAL_MS` (60 s; 0 turns it off) the reconciler compares the database with the chain and stores a report that `GET /v1/admin/reconciliation` serves ([ADR 0012](../../docs/decisions/0012-reconciliation.md)). It never writes to the chain.

| Finding                   | Meaning                                                                                           | Typical remedy                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `STUCK_SUBMITTED`         | No outcome event `RECONCILE_STUCK_AFTER_MS` after the hash was reported; the quote is now flagged | Look the transaction up in an explorer; it settles by itself if the event shows           |
| `SETTLED_WITHOUT_EVENT`   | A settled quote has no completion event stored                                                    | Check the indexer cursor and the receipt on chain                                         |
| `COMPLETION_NOT_SETTLED`  | A completion event is stored but the quote is not settled                                         | Compare quote state and event; correct by hand                                            |
| `SETTLEMENT_MISMATCH`     | A settled quote's event shows another user or amount                                              | Treat as an incident: compare the receipt with the quote                                  |
| `VAULT_INSOLVENT`         | Inventory exceeds the tokens the core holds (two runs in a row)                                   | Stop converting that pair; investigate the token transfers                                |
| `VAULT_UNTRACKED_BALANCE` | The core holds more tokens than inventory records (a direct transfer)                             | No contract method recovers it; see the [vault runbook](../../docs/runbooks/vault-low.md) |

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
