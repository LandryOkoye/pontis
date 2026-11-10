# ADR 0011: Event indexer

- **Status:** Accepted
- **Date:** 2026-11-08
- **Brief items:** §7.4, §13.2, §20
- **Related:** [0002](0002-contract-layout-and-events.md), [0006](0006-quote-signing-model.md), [0007](0007-conversion-via-ft-transfer-call.md)

## Context

The chain, not the database, says whether a conversion happened. The API moves a quote to `SUBMITTED` when a wallet reports a hash, but a wallet can crash, lie or report late. Something must read `pontis-core`'s events and settle conversions from them.

## Decisions

1. **Source.** `apps/indexer` follows **final** blocks only. For each block it reads the chunk of the shard that holds the core account (the layout comes from `EXPERIMENTAL_protocol_config`; an unknown layout falls back to every shard), keeps the **action** receipts addressed to the core, and fetches each outcome with `EXPERIMENTAL_light_client_proof`. That call finds an outcome by receipt ID alone, which no other node method does. Data receipts are ignored: they carry a promise result and have no outcome.
2. **Lag.** Blocks within three of the final head are not read yet. A receipt appears in the block that delivers it and runs in a later one; its outcome can be proven only when that block is final too. If a proof is still missing the pass fails and retries.
3. **Atomic, idempotent blocks.** Each block's events and the cursor advance commit in one transaction. An event's identity is `(receipt_id, log_index)`; a repeated event is dropped. On start the cursor moves back 30 blocks and they are read again (`INDEXER_RESCAN_BLOCKS`), which costs nothing and covers a node that served an incomplete view.
4. **Failed receipts are ignored.** A panicking receipt still logs, but its state changes were reverted, so its events describe nothing that happened.
5. **Events to states.** A completed conversion settles its quote; a failed payout or a refused input fails it. `NONCE_USED` rejections are only recorded: they are replays and say nothing about the original. A completion whose user or amounts differ from the quote goes to `REQUIRES_RECONCILIATION` with the difference in `failure_reason` and an `audit_log` row. An `ACCEPTED` quote the chain executed is treated as submitted (the wallet may not have reported yet).
6. **The chain wins over expiry.** A quote the chain executed while the API held it `QUOTED` or `EXPIRED` (never accepted, or swept at its deadline while the transaction was in flight) moves to `REQUIRES_RECONCILIATION`. The state machine allows that one move out of `EXPIRED`; before this ADR `EXPIRED` was final.
7. **Transaction hash.** A receipt does not say which transaction began it, so an event's `tx_hash` is optional. It is the conversion's reported hash when known; `POST /v1/conversions/{id}/submitted` fills it in later, even after settlement. The API schema marks it nullable.
8. **History is never skipped silently.** A height with no block is an empty block only if it is newer than the node's `earliest_block_height`. Older, the indexer raises `HistoryUnavailableError` and keeps retrying; the remedy is an archival node, or deleting the cursor and setting `INDEXER_START_HEIGHT` to accept the gap.
9. **The registry mirror stays with the sync job.** The API's registry sync copies chain state into Postgres and is the only writer of registry tables. The indexer stores registry events in `settlement_events` as an audit trail but does not apply them, so two writers cannot disagree.

## Consequences

- One chunk read per block on testnet instead of ten; at one block per second the indexer makes two to three RPC calls per second while idle (a block, its chunk, and a poll of the head).
- The indexer follows the chain roughly four blocks behind. A conversion shows as settled a few seconds after the transaction finalizes.
- A receipt the node cannot prove stalls the indexer. The loop retries with growing pauses, logs every failure, and `GET /v1/health` shows the lag and, through a heartbeat the indexer stamps on every successful pass, whether it is still running (`stale` when it is not), so a stall is visible rather than silent.
- Running the indexer against a node with short retention needs it to stay close to the head: the sandbox keeps only minutes of blocks.
