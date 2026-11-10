# Known limitations

What the MVP does not do, or does in a simplified way. The wider list of mocked areas is in [deliberately-mocked.md](architecture/deliberately-mocked.md); deferred features are in [ADR 0010](decisions/0010-deferred-scope.md).

## Scope

- **Synthetic assets on NEAR Testnet only.** Nothing is backed, verified or redeemable. The claim `SYN-GOLD-OZ` is fictional and both issuers are run by the project.
- **One pair, one direction of review.** TGOLD-A and TGOLD-B, one relationship, one fixed ratio, one flat fee (10 bps). No market pricing, no slippage, no other chains.
- **Controlled vault.** Liquidity is whatever the owner funds. A busy direction drains one side and quotes are refused with `INSUFFICIENT_INVENTORY`; refilling is manual ([runbook](runbooks/vault-low.md)).
- **No user accounts.** The wallet signature is the authority. Transaction history is public by account ID.
- **Web app.** There is no frontend in `main` and no frontend pull request on the remote (checked 2026-11-10). This repository's demo and end-to-end run drive the API.

## Operations

- **One admin key** for the API's admin endpoint; audit rows name a key fingerprint, not a person. One operator holds every contract role; separation of proposer and approver is not enforced on chain.
- **One API instance.** Rate-limit counters live in the process.
- **Free public RPC endpoints rate limit.** The indexer reads about two calls per block; with the reconciler and the API on the same free endpoint it gets `429`, backs off, and settlements arrive late (they are not lost). A demo wants a keyed endpoint or a node of its own.
- **The indexer trusts its RPC node.** To read a receipt's logs it asks the node for a light-client proof and reads the outcome inside it. It does not verify that proof cryptographically (no block-header signature check, no Merkle path check), so receiving a proof from the RPC is not the same as verifying one: a dishonest or faulty node could feed it false events. It follows final blocks about four blocks behind, reads only the core's shard, and stalls visibly (health shows lag) rather than skipping a block it cannot read. Past a node's retention, history needs an archival node ([indexer notes](../apps/indexer/README.md)).
- **State grows without bound.** The contract keeps every used quote nonce forever (replay protection) and the database keeps every quote, conversion, settlement event and audit row. There is no pruning. Pruning nonces would reopen replay of old quotes, so it is deliberately not done; at testnet volume this is storage cost only, but it must be designed (for example nonce expiry windows tied to quote expiry) before real use.
- **Operator role model.** One `owner` account grants and holds every contract role (registrar, compatibility approver, pauser) and is the only account that can fund or withdraw vault inventory, set the fee and the quote signer, and transfer ownership. There is no multi-party approval and no timelock. A compromised owner key can drain the vault and sign anything; a multisig owner and distinct role holders are preconditions for any non-testnet use.
- **The reconciler flags; it does not repair.** A stuck or inconsistent conversion becomes `REQUIRES_RECONCILIATION` and waits for a person, except that a late matching event settles it by itself. Vault findings need two consecutive runs, so they appear after about two minutes.
- **No alerting.** Reconciliation results are served at `GET /v1/admin/reconciliation`; nothing pages anyone.
- **Postgres is a local container.** No backup or restore drill. Registry state rebuilds from the chain; quotes, conversions and the audit log do not.
- **Quote-signer key** is one ed25519 key in an environment variable. Rotating it invalidates outstanding quotes at once.

## Contract behaviour worth knowing

- A quote lives 60 seconds. A transaction that lands after expiry is refused and refunded.
- Inventory is debited before the payout. If the payout fails the input is returned and the inventory restored, and the quote ends `FAILED`.
- A token sent to the core by plain `ft_transfer` is not credited to inventory and cannot be recovered: the contract has no sweep or credit method, so it stays as surplus until a redeploy and the reconciler keeps warning ([vault runbook](runbooks/vault-low.md)).
- Contracts are redeployed, not upgraded; there is no migration path.

## Verification status of the tooling

- **CI.** The workflow's latest run on `main` concluded `success` (run 40, commit `083c59d`, 2026-11-09). At that commit it covered Rust fmt, clippy and unit tests, the contract sandbox tests, and the Node lint, typecheck and tests. It did not run the system end-to-end run (`tests/e2e`); that is run by hand.
- **Testnet.** The contracts were deployed to Testnet on 2026-11-09 ([record](architecture/deployment-record.md)). A full `E2E_MODE=testnet` run is not reliable on the public RPC endpoints because of rate limiting.
- Only the `slim` wasm build and the sandbox are exercised end to end; the `cargo-near` and reproducible builds are untested here.
