# Stuck submission

A conversion the wallet reported as submitted has no outcome 10 minutes later. The reconciler moves it to `REQUIRES_RECONCILIATION` and lists it.

## Symptoms

- `GET /v1/admin/reconciliation` lists the quote under `requiresReconciliation`, with a `STUCK_SUBMITTED` finding.
- The user sees a conversion that is neither settled nor failed.

## Confirm

1. Get the hash: `curl -s $API/v1/transactions/$CONVERSION_ID | jq '{state, txHash, failureReason}'`.
2. Look the transaction up in a testnet explorer, or ask the RPC node, and read its outcome.
3. Check the indexer: `curl -s $API/v1/health | jq .indexerLagBlocks` and the indexer's log for a repeating error. A large lag or a repeating error means the transaction may well have succeeded and the indexer is behind.

## Do

| What the chain shows                                        | Action                                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The transaction succeeded and the indexer is behind or down | Fix the indexer (see its [operating notes](../../apps/indexer/README.md)). Its matching `conversion_completed` event settles the quote by itself; the finding clears. |
| The transaction failed, or the hash does not exist          | No funds moved. Resolve the quote by hand (below).                                                                                                                    |
| The transaction succeeded and the indexer is healthy        | Compare the event with the quote. A mismatch is an incident: [pause](pause.md), keep the evidence, and resolve by hand once understood.                               |

Resolve by hand, only after reading the chain. The row records who and why:

```sql
begin;
update quotes set state = 'FAILED', updated_at = now()
  where id = '<quote id>' and state = 'REQUIRES_RECONCILIATION';          -- or 'SETTLED' if funds did move
update conversions set failure_reason = '<what the chain showed>' where quote_id = '<quote id>';
insert into audit_log (actor, action, subject, detail)
  values ('operator:<name>', 'quote.resolved_manually', '<quote id>',
          '{"to": "FAILED", "evidence": "<explorer link or tx hash>"}');
commit;
```

## Done when

The quote is `SETTLED` or `FAILED`, the finding is gone from the next reconciler run (within a minute), and the audit log has the entry.
