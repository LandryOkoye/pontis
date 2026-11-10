# Known limitations

What the MVP does not do, or does in a simplified way. The wider list of mocked areas is in [deliberately-mocked.md](architecture/deliberately-mocked.md); deferred features are in [ADR 0010](decisions/0010-deferred-scope.md).

## Scope

- **Synthetic assets on NEAR Testnet only.** Nothing is backed, verified or redeemable. The claim `SYN-GOLD-OZ` is fictional and both issuers are run by the project.
- **One pair, one direction of review.** TGOLD-A and TGOLD-B, one relationship, one fixed ratio, one flat fee (10 bps). No market pricing, no slippage, no other chains.
- **Controlled vault.** Liquidity is whatever the owner funds. A busy direction drains one side and quotes are refused with `INSUFFICIENT_INVENTORY`; refilling is manual ([runbook](runbooks/vault-low.md)).
- **No user accounts.** The wallet signature is the authority. Transaction history is public by account ID.
- **Web app.** The frontend is a separate branch and pull request. This repository's demo and end-to-end run drive the API.

## Operations

- **One admin key** for the API's admin endpoint; audit rows name a key fingerprint, not a person. One operator holds every contract role; separation of proposer and approver is not enforced on chain.
- **One API instance.** Rate-limit counters live in the process.
- **Free public RPC endpoints rate limit.** The indexer reads about two calls per block; with the reconciler and the API on the same free endpoint it gets `429`, backs off, and settlements arrive late (they are not lost). A demo wants a keyed endpoint or a node of its own.
- **The indexer trusts its RPC node.** It reads proven outcomes but does not verify the light-client proof itself. It follows final blocks about four blocks behind, reads only the core's shard, and stalls visibly (health shows lag, and `stale` once its heartbeat stops) rather than skipping a block it cannot read. Past a node's retention, history needs an archival node ([indexer notes](../apps/indexer/README.md)).
- **The reconciler flags; it does not repair.** A stuck or inconsistent conversion becomes `REQUIRES_RECONCILIATION` and waits for a person, except that a late matching event settles it by itself. Vault findings need two consecutive runs, so they appear after about two minutes.
- **No alerting.** Reconciliation results are served at `GET /v1/admin/reconciliation`, and health at `GET /v1/health`; nothing pages anyone or polls them.
- **Health cannot tell a stopped indexer from a crashed one.** Both show as `stale` once the heartbeat is older than `INDEXER_STALE_AFTER_MS`; the indexer writes no stop marker. The heartbeat age uses the API's clock against the database's.
- **Postgres is a local container.** No backup or restore drill. Registry state rebuilds from the chain; quotes, conversions and the audit log do not.
- **Quote-signer key** is one ed25519 key in an environment variable. Rotating it invalidates outstanding quotes at once.

## Registry: what is recorded, not verified

- **Evidence is not authenticated.** The contract checks an evidence URI's length and that its SHA-256 is well-formed hex. It never fetches the content, compares the hash, or checks who produced it. The `provenance` label is chosen by the registrar. A hash or URI proves nothing about an asset's existence or legal status.
- **`independently_verified` is refused.** No authenticated verifier exists, so the contract rejects that status and that evidence label. `issuer_attested` and `third_party_attested` mean a registrar recorded the claim, not that it was checked.
- **Issuer metadata is enforced only as far as a registrar's entries go.** A representation needs an issuer whose `authorized_categories` include the canonical asset's category and, if `controlled_accounts` is non-empty, whose list includes the token account. An empty `controlled_accounts` means no constraint. The contract cannot prove the issuer controls those accounts or may issue that category.
- **Real RWA onboarding needs more:** signed issuer and verifier attestations, proof of account control, evidence content checked by someone other than the issuer, eligibility enforcement per asset, and separate registrar, attester and approver roles. None is built ([ADR 0009](decisions/0009-synthetic-evidence-labelling.md)).

## Contract behaviour worth knowing

- A quote lives 60 seconds. A transaction that lands after expiry is refused and refunded.
- Inventory is debited before the payout. If the payout fails the input is returned and the inventory restored, and the quote ends `FAILED`.
- A token sent to the core by plain `ft_transfer` is not credited to inventory and cannot be recovered: the contract has no sweep or credit method, so it stays as surplus until a redeploy and the reconciler keeps warning ([vault runbook](runbooks/vault-low.md)).
- Contracts are redeployed, not upgraded; there is no migration path.

## Not verified here

- The GitHub Actions workflows have not been seen running.
- Only the `slim` wasm build and the sandbox are exercised end to end; the `cargo-near` and reproducible builds are untested.
