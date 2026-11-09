# End-to-end run

One script that brings up a chain, the contracts, a database, the API and the indexer, and walks the product through them: catalog, quote, convert, index, refuse, reconcile.

```bash
scripts/build-contracts.sh slim              # once: the wasm the run deploys
export DATABASE_URL=postgres://pontis:pontis@localhost:5432/pontis
pnpm --filter @pontis/e2e e2e                # about three minutes after the first build
```

It deploys to a fresh sandbox and writes nothing to the repository (the deployment record goes to a temp directory). It creates and drops its own database, stops what it started, and on failure prints where the API, indexer and sandbox logs are. `E2E_MODE=testnet` runs against the deployment in the environment instead; see `.env.example`.

| Section        | What it proves                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog        | Both assets are listed, synthetic, unverified, with unit definitions; the pair is an approved `DIRECT_EQUIVALENT` and executable                                                |
| Conversion     | The quote equals the shared bigint math; accepting is idempotent; a signed transfer settles through the indexer; balances move by exactly the quoted amounts; replay is refused |
| Refusals       | Not allowlisted, no relationship, malformed input, a suspended pair (API and contract), an expired quote (API and contract)                                                     |
| Reconciliation | Admin endpoint needs the key; vault inventory equals held tokens; a direct transfer and a stuck submission are reported                                                         |
