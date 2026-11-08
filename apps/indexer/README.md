# @pontis/indexer

Follows `pontis-core` on NEAR and settles conversions in Postgres. It is the only writer of `settlement_events` and of the `SETTLED`, `FAILED` and `REQUIRES_RECONCILIATION` quote states. Design: [ADR 0011](../../docs/decisions/0011-indexer.md).

## Run

```bash
pnpm db:up
cp .env.example .env   # or export the variables below
pnpm --filter @pontis/indexer start
```

The indexer applies migrations on start, so it can run before or after the API.

| Variable                    | Default                        | Meaning                                                                                   |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | required                       | Postgres                                                                                  |
| `PONTIS_CORE_ACCOUNT_ID`    | required                       | The core contract to follow                                                               |
| `NEAR_RPC_URL`              | `https://rpc.testnet.near.org` | A node with `EXPERIMENTAL_light_client_proof`; use an archival node to catch up over days |
| `INDEXER_START_HEIGHT`      | the chain head                 | First block when there is no cursor. Set it to the deployment block to backfill           |
| `INDEXER_POLL_MS`           | `2000`                         | Pause between passes once caught up                                                       |
| `INDEXER_RESCAN_BLOCKS`     | `30`                           | Blocks read again behind the cursor on start                                              |
| `INDEXER_CHUNK_CONCURRENCY` | `4`                            | Parallel chunk reads; matters only without shard detection                                |

## What it writes

- `settlement_events`: every `EVENT_JSON` log of every successful core receipt, unique by `(receipt_id, log_index)`. Events that name a quote's nonce are linked to its conversion.
- `quotes.state` and `conversions`: `SETTLED` or `FAILED` from the conversion events; `REQUIRES_RECONCILIATION` (and an `audit_log` row) when the chain disagrees with the quote.
- `indexer_cursor`: the last block fully applied. `GET /v1/health` reports `indexerLagBlocks` from it.

## Operating notes

| Symptom                                         | Cause and remedy                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `indexerLagBlocks` grows, log repeats one error | The node cannot serve one block or proof. Failures retry with pauses up to 60 s; read the logged error. A different RPC node usually fixes it.                                                          |
| `HistoryUnavailableError`                       | The cursor is older than the node's retention (the sandbox keeps minutes, public testnet days). Use an archival node, or `delete from indexer_cursor` and set `INDEXER_START_HEIGHT` to accept the gap. |
| Quote is `REQUIRES_RECONCILIATION`              | The chain executed a quote the API had not accepted or had expired, or amounts differ. `audit_log` has the reason and receipt. The reconciler (B13) resolves it.                                        |
| A conversion has no `txHash` on its events      | The wallet has not reported it. `POST /v1/conversions/{id}/submitted` fills it in at any time.                                                                                                          |

Stop with `SIGINT` or `SIGTERM`; it finishes the block in progress.

## Limits

- It reads only the shard that holds the core account. If the account moves shards (resharding) the layout cache refreshes within ten minutes.
- It does not apply registry events; the API's registry sync owns those tables.
- Receipts a node cannot prove stall the indexer rather than being skipped.
