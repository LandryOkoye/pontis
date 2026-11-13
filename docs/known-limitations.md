# Known limitations

What the MVP does not do, or does in a simplified way. The wider list of mocked areas is in [deliberately-mocked.md](architecture/deliberately-mocked.md); deferred features are in [ADR 0010](decisions/0010-deferred-scope.md).

## Scope

- **NEAR Intents has no documented testnet endpoint.** The API defaults to its deterministic, labelled simulator. `INTENTS_MODE=live` enables production `/tokens`, dry `/quote` and `/status` reads; a partner JWT is optional and unauthenticated requests use 1Click's additional fee. Pontis does not submit deposits, persist Intents prices for its pricing engine, or assume its synthetic assets are routable.
- **Chain Signatures is a script-driven demonstration, not part of the Pontis contract.** A NEAR Testnet account is the sole mint authority for the Sepolia token; no relayer key exists on the EVM side. This demonstration is not a bridge and is not connected to `pontis-core`.
- **Private execution is a local API simulation.** Encrypted RFQ orders can be matched for `sim:` assets and participants/auditors can retrieve encrypted disclosures, but the matcher does not settle through core or record commitments on-chain. The matcher operator sees every order. See [the confidentiality threat model](threat-model/confidential.md).

- **Synthetic assets on NEAR Testnet only.** Nothing is backed, verified or redeemable. The claim `SYN-GOLD-OZ` is fictional and both issuers are run by the project.
- **One pair, one direction of review.** TGOLD-A and TGOLD-B, one relationship, one fixed ratio, one flat fee (10 bps). No market pricing, no slippage, no other chains.
- **Controlled vault.** Liquidity is whatever the owner funds. A busy direction drains one side and quotes are refused with `INSUFFICIENT_INVENTORY`; refilling is manual ([runbook](runbooks/vault-low.md)).
- **No user accounts.** The wallet signature is the authority. Transaction history is public by account ID.
- **Bridge work is a local foundation only.** `PermissionedBridgeToken` is deployed on Sepolia for a separate script-driven Chain Signatures demonstration. There is no deployed EVM route, NEAR bridge state machine, relayer, proof verifier, supply monitor, or tested bridge refund. The EVM token is not connected to `pontis-core`.
- **Web app.** `apps/web` is in `main` and reads mock data, not the API. This repository's demo and end-to-end run drive the API.

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

## Custody, reserves and redemption mirror (indexer, phase 4)

The indexer side of [ADR 0020](decisions/0020-custody-reserves-and-redemption.md) ([report](progress/phase-4-indexer.md)). Everything here is simulated: the custodian, the reserves and the issuer back-office are test keys, and nothing is custodied, backed or audited.

- **The mirror is a cache, and some of it is filled in later.** `custodian_registered` carries only the id and the key, so a custodian's name, jurisdiction and evidence are null until the indexer has read `get_custodian` (the end of each pass). Issuer reliability counters and the reserve status snapshot are read from the chain the same way, so for a few seconds after an event they can lag it.
- **`reserve_status` has two sources.** The event columns (`state`, `attested_units`, `ratio_bps`) are what `reserve_status_changed` said; `chain_status` is a snapshot from `get_reserve_status` taken by the monitor, so it can be up to a minute old. Neither is authority: the contract computes the status on read, and the route gate never uses the mirror.
- **Staleness has no event.** A representation whose attestations age out changes state only when someone calls `evaluate_reserve`. The reserve monitor does it every minute when it has a signer; without one it only reads, and the stored `reserve_status` row keeps its last event state.
- **`execute_mint` emits no event**, so a mint request is `requested` in the mirror until it is `minted`, `failed` or `cancelled`; `minting` is never seen.
- **Redemption timeline rows have no transaction hash.** The indexer reads receipt logs, which do not name the transaction that began them; `redemption_events.tx_hash` is null and the receipt id is the reference. Hash verification exists only for conversions.
- **`redemption_refused` is stored only as a raw `settlement_events` row.** It names no redemption and has no mirror table.
- **Reconciler escrow and breach findings need two runs**, so a real problem is reported about a minute late; a short outage of the indexer can raise one that clears on its own.
- **`GET /v1/admin/reserve-monitor` does not exist yet.** The monitor stores its report; the endpoint is the session and role task's.
- **The monitor key is a plain environment variable.** Only for a throwaway testnet account; the calls are permissionless and the account holds nothing.

## Custody, reserves and redemption (API, phase 4)

- **Every custodian, reserve figure and issuer is simulated.** A reserve attestation is a signed claim by a fictional custodian whose key the registrar recorded; no asset is custodied, backed, audited or redeemable for value, and the contract keeps refusing `independently_verified`. The API labels every response `simulated` with its `sources` and a `notice`, and a report URI is shown but never fetched or checked.
- **The history of redemptions is rebuilt from the chain record, not from events.** `GET /v1/redemptions/{id}` has a `timeline` made from the record's own times, so a step that a later step overtook (a rejection followed by a reclaim) has no time, and every `txHash` is null until the indexer's event mirror is read. The listing needs `user` or `representationId` because the chain lists by account or by asset; `status` filters within a page.
- **Reserve history is capped by the chain.** The contract keeps the last 500 attestations per asset; older ones exist only in events and in the indexer's tables, and the API does not serve them yet.
- **The reserve relay does not pre-verify the signature.** It forwards to the contract, which does; a forged call is refused on chain and costs the relayer its gas ([threat T60](threat-model/mvp.md), [runbook](runbooks/reserve-relay.md)). There is no relayer in fixtures mode, and one is needed in the real server only for this endpoint.
- **Reliability is a derived score on simulated counters.** The contract keeps counts and latency sums; the API computes the rates and averages. A demo issuer's figures say nothing about a real one.
- **Session endpoints are here, with limits** ([phase 4 session report](progress/phase-4-session.md)). Prepare, reclaim, the issuer queues and unsigned mint and redemption actions need a wallet session and return unsigned actions; the API signs and sends nothing. A payout instruction is stored encrypted and unread, is never returned, and nothing decrypts it or acts on it, because nothing is paid. Prepared instructions that never become a redemption are never purged. The issuer back-office is a labelled mock: an account in an issuer's `controlled_accounts` (a registrar's unproven claim) is authorised, checked against the chain on every call, and an operator role may read a queue but not act. A queue scans the newest 500 requests of each asset, so a rare status can be missed beyond that; `execute_mint` emits no event, so `minting` reaches the mirror from a chain read on the next indexer pass, not from an event.

## Demo catalogue: trust states are narrative

The demo seed (`seed-catalogue`) registers four simulated issuers in four states. Read them as labels a registrar set, not as results of any process ([dossiers](asset-dossiers/README.md)).

- **`issuer_attested` means the issuer supplied a dossier.** `halcyon-securities` and `orchard-trust` carry it; the contract only checks that some evidence exists. Nothing is `third_party_attested` (no third party verified anything) or `independently_verified` (the contract refuses it). There is no attestation mechanism until a later phase ([ADR 0014](decisions/0014-scope-expansion-beyond-mvp.md), workstream C).
- **`orchard-trust`'s lapsed attestation is a story.** The registry has no attestation expiry. What is on chain is a registrar moving the issuer to `deprecated` (terminal) while its `verification_status` stays `issuer_attested`, because records cannot be edited. Its approved pair with `tustb-h` stays approved, but no conversion can run, because the contract treats a representation as executable only while its issuer is `active`.
- **`meridian-assets` is pending only in the sense that nobody activated it.** Its tokens `tacme-m` and `tnova-m` are registered but cannot be activated while the issuer is `restricted`, so the `tacme-h` / `tacme-m` relationship is proposed and cannot be approved. There is no review queue.
- **`vantage-credit` is rejected before issuing anything.** A representation of a rejected issuer could never be activated, so it has none; `tcredit-1` sits under `halcyon-securities` instead.
- **The dossiers' dates and events are fiction.** The `syn-nova` split (announced, "effective 2026-12-15"), the `syn-credit` maturity (2028-03-31) and redemption terms, and the `syn-villa` appraisal are text. Nothing on chain implements corporate actions, maturity or redemption, and the unit multiplier of a representation is immutable, so a split could not be applied today.
- **`syn-villa` has a supply of one only because nobody minted more.** The faucet is disabled and the owner minted one token, but the owner can mint again; the registry cannot detect a second record of the same fictional villa.
- **Profiles are off-chain and simulated.** `asset_profiles` rows (`convertible`, `bridgeable`, a planned EVM entry) are hints written by `seed-profiles` with `simulated: true`; the contract is the authority on what can convert, and no bridge exists.

## Rich demo catalogue (tiers)

The rich catalogue ([ADR 0019](decisions/0019-phase-3-scope-and-demo-issuers.md) section 3) adds invented issuers, claims and tokens on top of the four issuers above, in three sizes (`--catalogue=mvp|demo|full`, [setup](local-setup.md#seed-the-demo-catalogue-optional)). Everything below is fiction presented realistically; none of it is verified, backed, custodied or regulated.

- **It is mock data.** Every name, domain (reserved `.example` suffix) and ticker is invented, and a test refuses names and symbols on a denylist of real brands and tickers. That is a guard, not a trademark search. Jurisdictions and regulator categories are real places and categories used as plain facts, so a reader can infer a licence that does not exist; each dossier says the issuer is not licensed or supervised by anyone.
- **The tier decides the cost.** Each token is a deployed contract account, funded with 0.00001 NEAR per wasm byte plus 1 NEAR. `pnpm --filter @pontis/scripts catalogue-plan` prices every tier from the plan. The NEAR figures follow from the deploy script's funding rule and the 179,598-byte slim token; the transaction counts come from the plan; **the times use assumed latencies and were not measured on a chain**, and no deploy was run for this work.
- **The core account is topped up during seeding.** The deploy funds `pontis-core` with 1 NEAR beyond its code, which the full tier's registry state exceeds, so `seed-catalogue` sends it the shortfall (estimated from the records not yet on chain, with a 1 NEAR buffer) before registering. The estimate is a size heuristic, not a measurement.
- **Stories are statuses a registrar set.** `kittiwake-cayman-partners` was active when its tokens were registered and its pair approved, then moved back to `restricted`; `wattlebird-capital` is `deprecated` (its self-attestation "lapsed" on 2026-09-30, a story: no attestation expiry exists); `peninsula-orient-assets` was never activated, so its tokens stay `restricted` and its pairs cannot be approved; `baobab-coast-finance` was rejected before issuing. A restricted or deprecated issuer's approved pairs stay approved but cannot convert, because a representation is executable only while its issuer is `active`.
- **The delisted share is one registrar action.** `tmfr-p` (`syn-stock-marlowe`) was moved to `deprecated` (terminal). The two-account delisting of [ADR 0018](decisions/0018-asset-lifecycle-and-nav-strikes.md) (`request_delist`, `approve_delist`) is not used because the seed has one account, and the simulated price keeps moving after the story's delisting date.
- **The Tarnowski split is a dossier record, not a corporate action.** The 3-for-1 split on 2026-12-01 is in [SYN-STOCK-TARNOWSKI](asset-dossiers/SYN-STOCK-TARNOWSKI.md) only: no action is proposed on chain, no multiplier changes and no freeze window opens. An operator can propose one with `actions propose`.
- **The redemption-gated note is text.** `syn-note-trade` says redemption opens only after maturity (2026-12-18) and only if a liquidity condition holds; nothing checks the condition, `seed-custody` gives it redemption terms with a window open for 3 days in every 180 (a term the contract enforces, but the maturity and the liquidity condition stay text), and `syn-note-sme` matures on 2027-06-30 with nothing happening.
- **Pair outcomes are chosen, not reviewed.** The compat approver (the deployer) approves, rejects or leaves each pair proposed by design: one pair is rejected, five are proposed (two of them `ECONOMICALLY_SIMILAR`, whose ratio is only a multiplier quotient and not a price), and the rest are approved with a guard preset (`fund`, `stable`, `equity`, `commodity`, `illiquid`; deviation bands only, no window limits). The vault of an approved pair is funded for both sides except `tusd-h` / `tusd-s`, where only `tusd-s` has inventory, so one direction runs out ([vault runbook](runbooks/vault-low.md)).
- **Single-wrapper claims have no conversion flow.** The simulator writes prices, NAV and supply for every claim but trades only between wrappers of one claim.
- **Custody, reserves and redemption data are in the next section.** The rich catalogue itself carries none of it: `seed-custody` attaches it by id ([demo custody data](#demo-custody-data-seed-custody)).

## Demo custody data (seed-custody)

`seed-custody` ([runbook](runbooks/seed-demo.md#custody-reserves-and-redemption), [progress](progress/phase-4-seed.md)) writes fictional custodians, reserve policies, simulated attestations, redemption terms and three simulated redemptions through the real contract methods. **Every custodian, figure, term and redemption is fiction and labelled `simulated`; nothing is custodied, backed, audited, regulated or paid out.**

- **The custodians are invented and unverified.** Eight made-up names (every one ends `(SIMULATED)`), `synthetic: true`, `unverified`, no evidence. A test refuses real custodian, vault-operator and audit-firm names; like the other denylists it is a guard, not a trademark search. A jurisdiction is a real place used as a plain fact.
- **One signer plays every custodian.** Each reserve figure is signed with the public dev `reserve-attester` key, so anyone can recompute it; the figure is the token's real supply times a cover ratio the data chose (`healthy` 100 to 110 percent, `thin` 99.5, `breached` 92, `warn_only` 97). The seed attests once per representation; a looping `reserves publish` keeps the others fresh and applies the same cover from the state file.
- **The stories decay.** The `stale` token (`teur-m`) has a 5 minute max age and is not refreshed, so within minutes its route is refused (`RESERVE_STALE`). The other attestations go stale after their max age (a day) unless a publisher runs, and a publisher that does not `--skip` the stale and never-attested representations (`teur-m`, `tmmfeur-c`) repairs the stories. A breached or stale token with `restrict_conversions` stops converting on purpose, so some seeded pairs cannot convert.
- **The holder, the issuer and the registrar share one key.** The deployer requests the three redemptions; accept and fulfil are signed by the issuer's token account, which the deploy created with the deployer's key. They are test accounts in a demo, not parties. The registrar and the reserve attester are kept apart (the attester is the role-holder account `custodian-sim.<deployer>`, which never signs).
- **Redemptions are leave-behind states.** One is left `requested`, one `accepted`, one `fulfilled` (the escrow burned, nothing paid out). No history exists: the contract has no time travel, so no old, rejected or expired redemption is seeded. A running back-office will accept the `requested` one unless told to `--ignore` it.
- **Gating closes the owner mint.** The core becomes the minter of `ttb3m-m` and `tigc-r`, so their owner `mint` and faucet fail; the seed does not top those tokens up after a redemption burn.
- **The tier decides the cost.** `catalogue-plan` prints the custody seed's transactions, storage NEAR and time per tier, derived from the plan (demo about 37 transactions, full about 142). A unit test checks the count against a fake chain; **nothing was measured on a real chain, the latencies are assumed, and no sandbox or testnet run was made for this work.**
- **Single-custodian links only.** The simulator attests each linked custodian at the full cover, so a link to several would add up to several times the supply; the data links one custodian per representation, though the contract allows four.
- **Dossiers of phase 1 representations carry no section.** Only the generated claim dossiers describe custody; the hand-written dossiers of the phase 1 claims are unchanged, so a chain seeded before this change holds the older dossier hashes as evidence.

## Contract behaviour worth knowing

- A quote lives 60 seconds. A transaction that lands after expiry is refused and refunded.
- The output is reserved (taken out of inventory) before the payout, and the input is held as pending, not spendable, until the payout succeeds. If the payout fails the input is returned by the token's refund, the reserved output goes back to inventory, and the quote ends `FAILED`. The settlement is callback-based with a compensating refund, not atomic ([ADR 0007](decisions/0007-conversion-via-ft-transfer-call.md)).
- A token sent to the core by plain `ft_transfer` is not credited to inventory and cannot be recovered: the contract has no sweep or credit method, so it stays as surplus until a redeploy and the reconciler keeps warning ([vault runbook](runbooks/vault-low.md)).
- Contracts are redeployed, not upgraded; there is no migration path.

- **End-to-end coverage of Phase 4.** The `custody` scenario of `tests/e2e` runs on a local sandbox only (never on Testnet), drives the chain directly with the scripts' code and the wallet helper, and does not cover the session endpoints (prepare, reclaim intent, issuer queue). A redemption's fulfil deadline is `settlement_days` (1 to 30) after acceptance, so only the accept deadline is exercised on a chain; the fulfil deadline is covered by contract unit tests.

## Verification status of the tooling

- **CI.** The workflow runs Rust fmt, clippy and unit tests, the contract sandbox tests, the Node lint, typecheck and tests, and the system end-to-end run (`tests/e2e`, on a local sandbox, no public RPC). Observed on GitHub on 2026-11-10: the first run of the `e2e` job, on `main` (run 42907995499, merge of PR 27), passed together with the Rust and contract jobs; the same run's Node job failed `format:check` on `docs/threat-model/mvp.md`, which PR 30 fixes. Do not read "CI is green" from this file; read the current run.
- **Testnet.** The contracts were deployed to Testnet on 2026-11-09 ([record](architecture/deployment-record.md)). A full `E2E_MODE=testnet` run is not reliable on the public RPC endpoints because of rate limiting.
- Only the `slim` wasm build and the sandbox are exercised end to end; the `cargo-near` and reproducible builds are untested here.
