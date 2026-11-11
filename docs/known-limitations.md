# Known limitations

What the MVP does not do, or does in a simplified way. The wider list of mocked areas is in [deliberately-mocked.md](architecture/deliberately-mocked.md); deferred features are in [ADR 0010](decisions/0010-deferred-scope.md).

## Scope

- **Synthetic assets on NEAR Testnet only.** Nothing is backed, verified or redeemable. The claim `SYN-GOLD-OZ` is fictional and both issuers are run by the project.
- **One pair, one direction of review.** TGOLD-A and TGOLD-B, one relationship, one fixed ratio, one flat fee (10 bps). No market pricing, no slippage, no other chains.
- **Controlled vault.** Liquidity is whatever the owner funds. A busy direction drains one side and quotes are refused with `INSUFFICIENT_INVENTORY`; refilling is manual ([runbook](runbooks/vault-low.md)).
- **No user accounts.** The wallet signature is the authority. Transaction history is public by account ID.
- **Web app.** There is no frontend in `main` and no frontend pull request on the remote (checked 2026-11-10). This repository's demo and end-to-end run drive the API.

## Operations

- **Operators sign in with a wallet; the shared admin key remains as break-glass.** Admin endpoints take a session (NEP-413 sign-in, roles read from the contract) or, while `ADMIN_API_KEY` is set, that key, audited as `legacy-admin-key`; it is removed in phase 7. See [the auth runbook](runbooks/auth.md). One operator holds every contract role; separation of proposer and approver is not enforced on chain.
- **One API instance.** Rate-limit counters live in the process.
- **Free public RPC endpoints rate limit.** The indexer reads about two calls per block; with the reconciler and the API on the same free endpoint it gets `429`, backs off, and settlements arrive late (they are not lost). A demo wants a keyed endpoint or a node of its own.
- **The indexer trusts its RPC node.** To read a receipt's logs it asks the node for a light-client proof and reads the outcome inside it. It does not verify that proof cryptographically (no block-header signature check, no Merkle path check), so receiving a proof from the RPC is not the same as verifying one: a dishonest or faulty node could feed it false events. It follows final blocks about four blocks behind, reads only the core's shard, and stalls visibly (health shows lag, and `stale` once its heartbeat stops) rather than skipping a block it cannot read. Past a node's retention, history needs an archival node ([indexer notes](../apps/indexer/README.md)).
- **State grows without bound.** The contract keeps every used quote nonce forever (replay protection) and the database keeps every quote, conversion, settlement event and audit row. There is no pruning. Pruning nonces would reopen replay of old quotes, so it is deliberately not done; at testnet volume this is storage cost only, but it must be designed (for example nonce expiry windows tied to quote expiry) before real use.
- **Operator role model.** One `owner` account grants and holds every contract role (registrar, compatibility approver, pauser) and is the only account that can fund or withdraw vault inventory, set the fee and the quote signer, and transfer ownership. There is no multi-party approval and no timelock. A compromised owner key can drain the vault and sign anything; a multisig owner and distinct role holders are preconditions for any non-testnet use.
- **Transaction hashes are verified, but only after the wallet reports one.** The indexer cannot tell which transaction began a receipt, so the API never discovers a hash by itself. A conversion whose wallet never calls `POST /v1/conversions/{id}/submitted` settles with `txHash: null` and `txHashStatus: NONE`; there is no explorer link for it. A reported hash the node does not know yet (or cannot be asked about) stays `REPORTED`; the indexer retries it about once a minute, but only after an outcome event for that conversion exists, and again when the wallet repeats the report.
- **Hash verification trusts the same RPC node as everything else.** The API and the indexer read the transaction with the `tx` method of the configured node and compare signer, receiver, call arguments, quote nonce and receipt IDs. A dishonest or wrong-network node can confirm a false hash; the transaction is not proven with a light-client proof.
- **The reconciler flags; it does not repair.** A stuck or inconsistent conversion becomes `REQUIRES_RECONCILIATION` and waits for a person, except that a late matching event settles it by itself. Vault findings need two consecutive runs, so they appear after about two minutes.
- **No alerting.** Reconciliation results are served at `GET /v1/admin/reconciliation`, and health at `GET /v1/health`; nothing pages anyone or polls them.
- **Health cannot tell a stopped indexer from a crashed one.** Both show as `stale` once the heartbeat is older than `INDEXER_STALE_AFTER_MS`; the indexer writes no stop marker. The heartbeat age uses the API's clock against the database's.
- **Postgres is a local container.** No backup or restore drill. Registry state rebuilds from the chain; quotes, conversions and the audit log do not.
- **Quote-signer key** is one ed25519 key in an environment variable. Rotating it invalidates outstanding quotes at once.

- **Roles lag by up to 60 seconds.** A session caches the account's contract roles for a minute; only the reconciliation read re-checks the chain on every call. A key removed from an account keeps its existing session (at most 8 hours; log out revokes at once).
- **Sign-in proves a key, not a person.** A full-access key is what NEP-413 asks for; a function-call key is accepted as proof the account issued it and is recorded as such. Anyone can request a challenge for any account; it can only be answered with that account's key.
- **Sessions are bearer tokens** with no binding to a device, and the `/metrics` scraper must use the break-glass key because a session idles out. Sessions and challenges live in Postgres; there is no session list or "log out everywhere".
- **No issuer onboarding.** Issuers and assets are mock data ([ADR 0019](decisions/0019-phase-3-scope-and-demo-issuers.md)); there is no application, proof of account control or third-party attestation.

## Registry: what is recorded, not verified

- **Evidence is not authenticated.** The contract checks an evidence URI's length and that its SHA-256 is well-formed hex. It never fetches the content, compares the hash, or checks who produced it. The `provenance` label is chosen by the registrar. A hash or URI proves nothing about an asset's existence or legal status.
- **`independently_verified` is refused.** No authenticated verifier exists, so the contract rejects that status and that evidence label. `issuer_attested` and `third_party_attested` mean a registrar recorded the claim, not that it was checked.
- **Issuer metadata is enforced only as far as a registrar's entries go.** A representation needs an issuer whose `authorized_categories` include the canonical asset's category and, if `controlled_accounts` is non-empty, whose list includes the token account. An empty `controlled_accounts` means no constraint. The contract cannot prove the issuer controls those accounts or may issue that category.
- **Real RWA onboarding needs more:** signed issuer and verifier attestations, proof of account control, evidence content checked by someone other than the issuer, eligibility enforcement per asset, and separate registrar, attester and approver roles. None is built ([ADR 0009](decisions/0009-synthetic-evidence-labelling.md)).

## Market data (expansion)

- **Almost all market data is simulated.** Prices, NAV, supply and most trade flow come from `apps/simulator`, flagged `simulated: true` ([ADR 0015](decisions/0015-market-data-platform.md)). Only conversions settled on the testnet are real, and they do not have a real price: a candle exists only where a price point does, so real conversion volume does not reach the charts today.
- **Candle volume of a parity conversion is units moved**, not a market measure; one-minute and five-minute candles cover the last two days only and are mostly filled carry-forwards.
- **Price attestations are verified on chain only for guarded pairs, and only against a key the owner registered.** The simulator signs each price with a key derived from a public label (`@pontis/dev-keys`); `submit_price` checks the signature, the contract account, the layout and that the price is newer, and nothing more. The relayer (`scripts guards publish`) signs the price in force now as of now, because the feed steps every five minutes; a real feed would sign its own observation time. Rows written before the v2 layout (`pontis-price-v1`) no longer verify.
- **The directory sorts and filters in memory** over the joined catalogue, and its cursor is an offset tied to the query. Fine for a few thousand assets; a row inserted between pages can shift one.
- **Holders, TVL beyond the vault, pools, reserves, premium and parity-deviation charts, and realtime streams are not built yet.** Each arrives with the phase that creates its data ([handoff](api/FRONTEND_HANDOFF.md)).

## Price guards (contract, phase 2)

- **A relationship has no guard until a compat approver sets one.** Unguarded pairs convert at the fixed ratio as before, whatever the market says. The seed sets guards on the demo pairs.
- **The reference price is a signed attestation, not a market.** Nothing but the simulator publishes prices, with a key anyone can recompute. The guard shows the mechanism works; it says nothing about any real price.
- **Limits are tumbling windows.** Up to twice the window limit can pass across a boundary. A payout failure does not give the allowance back.
- **The breaker counts evaluations.** Every price submission evaluates the pair, so a deviation counts once per submission that leaves it in place, including one for the other leg.

## Roles and signer keys (contract, phase 3)

- **The owner decides which keys count.** The owner registers every attester signer key; the contract checks the role, the scope and the curve, not who really holds the key. Until a multisig owner exists (phase 7) that is one account's judgement.
- **Separation is per account.** A registrar cannot hold an attester role and the owner holds none, but one operator can run two accounts. The rule shows the mechanism, not an organisation.
- **Issuer onboarding is not built** ([ADR 0019](decisions/0019-phase-3-scope-and-demo-issuers.md)). No issuer is `third_party_attested`, and attester roles sign reserves, custody and bridge attestations only, never issuer claims.

## Custody, reserves and the gated mint (contract, phase 4)

The contract side of [ADR 0020](decisions/0020-custody-reserves-and-redemption.md) sections 2 to 6. Nothing is custodied, backed, audited or regulated; every figure is `simulated`.

- **A reserve attestation is a signed figure, not a bank balance.** The simulator custodian signs whatever the demo script says, with a published dev key. The contract proves who signed and when, never that the reserves exist.
- **Supply is trusted through a ledger and a read.** The core counts what its gate minted and what redemption burned, and `refresh_supply` reads the token. A token the owner can still mint from shows up only after a read, and the owner can clear the minter.
- **The status is computed on read.** Staleness changes with time, so `reserve_status_changed` is emitted only when someone calls `evaluate_reserve` (the monitor does, each minute); the route gate never depends on that call.
- **Headroom ignores tolerance.** `tolerance_bps` widens the invariant, not the amount that may be minted. Under `warn` and `restrict_conversions` a stale attestation still caps mint at its last figure; only `pause_mint` refuses.
- **A suspended custodian lowers reserves at once** but emits no status event until the next evaluation.
- **The back office is a claim.** `controlled_accounts` of the issuer decides who may mint; proof of control was cut ([ADR 0019](decisions/0019-phase-3-scope-and-demo-issuers.md)).
- **The history ring holds the last 500 attestations per representation** on chain; the indexer keeps the rest.

## Redemption (contract, phase 4)

The contract side of [ADR 0020](decisions/0020-custody-reserves-and-redemption.md) section 7. A redemption pays nothing: it moves the user's tokens into escrow and burns or returns them.

- **No value moves.** `fee_units` and `net_units` are figures the simulated issuer is meant to honour off chain; nothing models a fiat payout, a custody release or a legal claim.
- **Fulfilment is the issuer's word.** The back office posts an evidence hash; the contract checks its shape, not what it points to. A fulfilment burns the escrow whether or not any payout happened.
- **Reliability is a counter, not a score.** The contract counts requests, accepts, fulfilments, rejections, misses and latency; the API derives a score and labels it `simulated`.
- **Settlement days are whole days.** At least one day to fulfil after accepting, so the fulfil deadline is only reached in unit tests; the accept deadline can be seconds.
- **A redeeming holder is not checked for eligibility.** Redemption is an exit, so there is no allowlist check.
- **The escrow needs a working token.** A burn or return that fails leaves the tokens in the core and the request in its earlier state until a retry succeeds.
- **The core's token balance now includes escrow.** The vault check compares `get_inventory` with `ft_balance_of(core)`; with redemptions the balance also covers `get_escrow_ledger(...).held`, so a reconciler must add it to the expected balance or it reports a surplus.

## Corporate actions, lifecycle and NAV strikes (contract, phase 2)

The contract side of [ADR 0017](decisions/0017-corporate-actions-and-multiplier-epochs.md) and [0018](decisions/0018-asset-lifecycle-and-nav-strikes.md), and its API, scripts and indexer mirrors ([phase 2 actions API](progress/phase-2-actions-api.md)). The web mirror is separate work.

- **Actions are registrar-entered records, not observed facts.** The contract enforces the freeze and the agreement of multipliers; it does not know a split happened. Evidence is a recorded claim like any other ([ADR 0009](decisions/0009-synthetic-evidence-labelling.md)).
- **A wrapper that never applies blocks every route touching it.** An approved split cannot be cancelled once effective. The registrar applies for the issuer; an issuer that does not cooperate leaves its claim's routes closed until its wrapper is deprecated (then `settle_corporate_action` closes the action).
- **Application needs the effective time to have passed.** Approval is refused at or after `effective_ms`, so an action is always announced and frozen before it takes effect; an action proposed too late is simply never approved. A corrected action is a new action.
- **A wrapper registered while an action is open must apply it too.** It counts as unapplied, and a wrapper already registered at the new denomination cannot apply the old factor. Register new wrappers only when no approved action is open.
- **A non-uniform change closes the pair until it is rebased.** A split on one side of a cross-claim pair leaves it `epoch_mismatch`; a `compat_approver` re-proposes the pair at the ratio the new multipliers give and approves it, which is a new version. There is no automatic rebasing.
- **Mid-window quotes.** `get_route` returns `next_freeze_ms`, but the contract only re-checks at execution. A quote that outlives a freeze start is refused with `CORPORATE_ACTION_FREEZE`; the API therefore clamps a quote's `expiresAt` to `next_freeze_ms`, so it never signs one that would.
- **Cash and stock distributions are data only.** `dividend_cash`, `dividend_stock`, `merger`, `spin_off`, `delisting` and `symbol_change` are recorded and (for a multiplier-free action) settled; nothing is paid or rebalanced on chain.
- **Delisting needs two accounts but they may belong to one person.** `request_delist` (registrar) and `approve_delist` (a different compat approver) are distinct accounts, not distinct people; role separation is phase 3. Proposer and approver of an action are checked the same way.
- **No pending conversions.** A NAV fund converts only inside an open strike window, priced off that strike through the deviation guard ([ADR 0018](decisions/0018-asset-lifecycle-and-nav-strikes.md) section 4). A user who wants the next strike waits for the next window; forward pricing needs the escrow of phases 4 and 6.
- **A NAV strike is a signed attestation.** Like a price it is only as true as its publisher; the demo's strikes are simulated and labelled `simulated` with their `source`. The window rule `now - as_of <= 2 * (cutoff - as_of)` never binds inside `[as_of, cutoff)`; it is kept as the ADR states it.
- **Matured, redeeming and redeemed stages block conversion; no exit flow exists yet.** Redemption is phase 4.
- **Corporate actions of an asset are capped at 32 and epochs of a representation at 16.**
- **The wrapper list of an action comes from the registry mirror.** `GET /v1/assets/{id}/corporate-actions` reads actions and epochs live but takes the set of wrappers (and their `live` status) from the synced registry, so it can lag the chain by one sync. The `CORPORATE_ACTION_OVERDUE` finding uses the same mirror.
- **The overdue finding is a warning, raised on the next reconciler run after 10 minutes, once per action.** It does not say which operator should act.
- **NAV strikes carry the feed's `simulated_feed` label.** The operator command signs the simulator's NAV (or `--nav`) with the dev publisher key; no real fund data exists.

## Demo catalogue: trust states are narrative

The demo seed (`seed-catalogue`) registers four simulated issuers in four states. Read them as labels a registrar set, not as results of any process ([dossiers](asset-dossiers/README.md)).

- **`issuer_attested` means the issuer supplied a dossier.** `halcyon-securities` and `orchard-trust` carry it; the contract only checks that some evidence exists. Nothing is `third_party_attested` (no third party verified anything) or `independently_verified` (the contract refuses it). There is no attestation mechanism until a later phase ([ADR 0014](decisions/0014-scope-expansion-beyond-mvp.md), workstream C).
- **`orchard-trust`'s lapsed attestation is a story.** The registry has no attestation expiry. What is on chain is a registrar moving the issuer to `deprecated` (terminal) while its `verification_status` stays `issuer_attested`, because records cannot be edited. Its approved pair with `tustb-h` stays approved, but no conversion can run, because the contract treats a representation as executable only while its issuer is `active`.
- **`meridian-assets` is pending only in the sense that nobody activated it.** Its tokens `tacme-m` and `tnova-m` are registered but cannot be activated while the issuer is `restricted`, so the `tacme-h` / `tacme-m` relationship is proposed and cannot be approved. There is no review queue.
- **`vantage-credit` is rejected before issuing anything.** A representation of a rejected issuer could never be activated, so it has none; `tcredit-1` sits under `halcyon-securities` instead.
- **The dossiers' dates and events are fiction.** The `syn-nova` split (announced, "effective 2026-12-15"), the `syn-credit` maturity (2028-03-31) and redemption terms, and the `syn-villa` appraisal are text. Nothing on chain implements corporate actions, maturity or redemption, and the unit multiplier of a representation is immutable, so a split could not be applied today.
- **`syn-villa` has a supply of one only because nobody minted more.** The faucet is disabled and the owner minted one token, but the owner can mint again; the registry cannot detect a second record of the same fictional villa.
- **Profiles are off-chain and simulated.** `asset_profiles` rows (`convertible`, `bridgeable`, a planned EVM entry) are hints written by `seed-profiles` with `simulated: true`; the contract is the authority on what can convert, and no bridge exists.

## Contract behaviour worth knowing

- A quote lives 60 seconds. A transaction that lands after expiry is refused and refunded.
- The output is reserved (taken out of inventory) before the payout, and the input is held as pending, not spendable, until the payout succeeds. If the payout fails the input is returned by the token's refund, the reserved output goes back to inventory, and the quote ends `FAILED`. The settlement is callback-based with a compensating refund, not atomic ([ADR 0007](decisions/0007-conversion-via-ft-transfer-call.md)).
- A token sent to the core by plain `ft_transfer` is not credited to inventory and cannot be recovered: the contract has no sweep or credit method, so it stays as surplus until a redeploy and the reconciler keeps warning ([vault runbook](runbooks/vault-low.md)).
- Contracts are redeployed, not upgraded; there is no migration path.

## Verification status of the tooling

- **CI.** The workflow runs Rust fmt, clippy and unit tests, the contract sandbox tests, the Node lint, typecheck and tests, and the system end-to-end run (`tests/e2e`, on a local sandbox, no public RPC). Observed on GitHub on 2026-11-10: the first run of the `e2e` job, on `main` (run 42907995499, merge of PR 27), passed together with the Rust and contract jobs; the same run's Node job failed `format:check` on `docs/threat-model/mvp.md`, which PR 30 fixes. Do not read "CI is green" from this file; read the current run.
- **Testnet.** The contracts were deployed to Testnet on 2026-11-09 ([record](architecture/deployment-record.md)). A full `E2E_MODE=testnet` run is not reliable on the public RPC endpoints because of rate limiting.
- Only the `slim` wasm build and the sandbox are exercised end to end; the `cargo-near` and reproducible builds are untested here.
