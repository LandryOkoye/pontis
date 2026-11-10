# Demo script

About ten minutes. Everything shown is a **synthetic test asset on NEAR Testnet**; say so at the start, and again when the unit definition appears. This script drives the API and the operator commands; the web app follows the same flow screen by screen.

**Before you start:** the system is running ([local setup](local-setup.md), step 4), `API` points at it, `USER` is a testnet account on the allowlist that holds some TGOLD-A, and you have an `ADMIN_API_KEY`.

```bash
API=http://localhost:3000
USER=alice.testnet
```

## 1. What is being converted (2 min)

```bash
curl -s $API/v1/assets | jq '.items[] | {id, symbol, synthetic, verificationStatus, unitMultiplier}'
curl -s $API/v1/assets/tgold-a | jq '{unit: .canonicalAsset.unitDefinition, rights: .canonicalAsset.economicRights, risks: .canonicalAsset.riskDisclosures, evidence: [.evidence[].provenance]}'
curl -s $API/v1/assets/tgold-a/compatibility | jq '.items[] | {counterpartId, classification, status, ratio, rationale}'
```

Say: two representations of one fictional claim, `SYN-GOLD-OZ`. Both are `synthetic` and `unverified`; the evidence is self-attested and labelled so. One relationship exists, `DIRECT_EQUIVALENT`, approved with a recorded rationale. 1 TGOLD-A is 10 TGOLD-B because the decimals differ, and that ratio is checked on chain against the unit multipliers.

## 2. Is there a route, and why (1 min)

```bash
curl -s $API/v1/routes/compare -H 'content-type: application/json' \
  -d '{"fromId":"tgold-a","toId":"tgold-b","amount":"1000000"}' | jq
curl -s $API/v1/routes/compare -H 'content-type: application/json' \
  -d '{"fromId":"tgold-a","toId":"tgold-a"}' | jq '.routes[0] | {executable, reasonCode, explanation}'
```

Say: a route is executable only for an approved direct equivalent between two active assets. Otherwise the answer is a reason, not a quote.

## 3. A quote (2 min)

```bash
curl -s $API/v1/quotes -H 'content-type: application/json' \
  -d "{\"fromId\":\"tgold-a\",\"toId\":\"tgold-b\",\"amountIn\":\"1000000\",\"accountId\":\"$USER\"}" | tee /tmp/quote.json | jq
```

Point at: ratio, `feeBps` and `fee` (taken from the output), `amountOut`, `expiresAt` (60 seconds), `compatibilityVersion` and `policyVersion`, and `warnings`. All amounts are integer strings; there is no floating point anywhere. A non-allowlisted account gets `NOT_ELIGIBLE` here, with no quote.

## 4. Accept and sign (2 min)

```bash
QUOTE=$(jq -r .id /tmp/quote.json)
curl -s $API/v1/conversions -H 'content-type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"quoteId\":\"$QUOTE\"}" | tee /tmp/plan.json | jq '.actions[] | {receiverId, methodName, deposit, gas}'
```

Say: the API returns **unsigned actions** and never holds the user's key. If the user is not yet registered on TGOLD-B, a `storage_deposit` comes first. The user signs `ft_transfer_call` on TGOLD-A with the signed quote as the message; each action has its own receiver, so a wallet sends them as separate transactions, in order. Sending the same request again returns the same plan; a second key for the same quote is refused with `QUOTE_ALREADY_USED`.

Sign and send the actions from the wallet (the web app does this with the wallet selector; [`tests/e2e/src/wallet.ts`](../tests/e2e/src/wallet.ts) is a script that does the same).

## 5. Settlement (1 min)

```bash
ID=$(jq -r .conversionId /tmp/plan.json)
watch -n 2 "curl -s $API/v1/transactions/$ID | jq '{state, txHash, txHashStatus, events: [.events[].eventName]}'"
```

The state moves to `SETTLED` a few seconds after the transaction finalizes, with a `conversion_completed` event. The wallet does not have to report anything: the indexer reads the chain. Check the amounts against the quote, and `curl -s "$API/v1/transactions?account=$USER"` for the history.

## 6. When it says no (1 min)

```bash
pnpm --filter @pontis/scripts ops suspend-pair "demo: issuer reported a problem"
curl -s $API/v1/quotes -H 'content-type: application/json' \
  -d "{\"fromId\":\"tgold-a\",\"toId\":\"tgold-b\",\"amountIn\":\"1000000\",\"accountId\":\"$USER\"}" | jq
```

Within a few seconds the API answers `RELATIONSHIP_SUSPENDED`. A quote signed before the suspension is refused by the **contract** too: the input comes back and the quote ends `FAILED`. Reinstate with `ops approve-pair "demo over"`. The same applies to an expired quote (`QUOTE_EXPIRED`), a paused asset (`ops pause-asset tgold-b`) and an account that left the allowlist.

## 7. Does it add up (1 min)

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" $API/v1/admin/reconciliation | jq '{status, vaults, findings, requiresReconciliation}'
```

Each vault's inventory equals the tokens the core holds; findings are empty. On a throwaway sandbox (never on the real deployment: the surplus cannot be recovered), a plain `ft_transfer` of a token to the core makes the reconciler report `VAULT_UNTRACKED_BALANCE` within a couple of minutes; `pnpm --filter @pontis/e2e e2e` does exactly that. A submission that never settles is flagged after ten minutes. Close with [what is mocked](architecture/deliberately-mocked.md) and the [known limitations](known-limitations.md).
