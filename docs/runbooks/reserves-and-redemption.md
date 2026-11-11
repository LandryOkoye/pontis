# Reserves, gated mint and redemption (SIMULATED)

The contract enforces signed reserve attestations against token supply, caps a gated mint at the attested reserve, and runs a redemption with escrow ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)). **Everything on the demo is simulated.** The custodian and the issuer back-office are two scripts holding public dev keys; nothing is custodied, backed, audited or paid out, every attestation carries `simulated: true` and `source: "simulated_custodian"`, and the contract still refuses `independently_verified` evidence. The logic (signatures, state machines, invariants) is real; the assets behind it are not.

`scripts/reserves.ts` and `scripts/backoffice.ts` are **testnet and sandbox only, dev-key tools**: every dev key is derived from a public label ([`packages/dev-keys`](../../packages/dev-keys/src/index.ts)), so anyone can recompute it. They refuse any other network and must never be pointed at anything of value.

```bash
pnpm --filter @pontis/scripts reserves            # prints the command list
pnpm --filter @pontis/scripts backoffice --help   # back-office options
```

Registrar and owner commands sign as the deployer account. `publish` submits as `RELAYER_ACCOUNT_ID` (and `RELAYER_PRIVATE_KEY`, or its NEAR credentials file) when set, otherwise as the deployer: the attestation's signature is the authority, the relayer only pays gas and the 1 yoctoNEAR. Every state-changing call attaches the 1 yoctoNEAR the contract requires. See `scripts/.env.example` for the variables.

## Set up (once per deployment, in this order)

Example: token `tgold-a`, a simulated custodian `vault-co-sim`, and the reserve-attester role held by `custodian-sim.testnet`. That account never signs a transaction; it only names the holder the signer key is tied to.

1. **Roles** (owner). A registrar cannot also be a reserve attester, in either order: the account that registers a custodian can never sign its reserves, and the contract refuses the second grant. On the demo the deployer acts as registrar, so grant it the role (the owner holds no role implicitly).

   ```bash
   pnpm --filter @pontis/scripts reserves grant-role registrar "$DEPLOYER_ACCOUNT_ID"
   pnpm --filter @pontis/scripts reserves grant-role reserve_attester custodian-sim.testnet
   ```

2. **Signer key** (owner). Ties the dev reserve-attester public key to the attester account with scope `reserves`. A key removed from the registry, or whose role is revoked, stops working at once.

   ```bash
   pnpm --filter @pontis/scripts reserves register-attester custodian-sim.testnet
   ```

   The dev key is `ed25519:4kMKwAzDWxTZzGPAfp9HFg2e7r9BFzpH3E51T2HaVhNm` (SIMULATED signer).

3. **Register the custodian** (registrar). `synthetic` is always `true` here. The key must already be in the registry with scope `reserves` (step 2). Evidence is optional; if given it is `issuer_provided`, and `independently_verified` is refused.

   ```bash
   pnpm --filter @pontis/scripts reserves register-custodian vault-co-sim \
     --name "Meridian Vault Co (SYNTHETIC)" --jurisdiction CH
   ```

4. **Link custody** (registrar). 1 to 4 distinct, active custodians; the link replaces the previous one. The structure is `segregated`, `omnibus` or `on_chain_vault`.

   ```bash
   pnpm --filter @pontis/scripts reserves link tgold-a segregated vault-co-sim
   ```

5. **Set the reserve policy** (owner). This makes the representation _monitored_. Without a policy nothing below applies and the API says `unmonitored`. The policy loosens or tightens the safety invariant, so it is deliberate and `--action` has no default.

   ```bash
   pnpm --filter @pontis/scripts reserves set-policy tgold-a \
     --action restrict_conversions --tolerance-bps 0 --max-age-ms 300000 \
     --baseline-supply 1000000000
   ```

   - `--action`: `warn` (flag only), `restrict_conversions` (refuse routes while `breached`, `stale` or `no_attestation`), `pause_mint` (as `restrict_conversions`, and refuse gated mints too).
   - `--tolerance-bps` 0 to 1000. `--max-age-ms` 60 000 to 2 592 000 000 (keep it above the publish interval, several times over).
   - `--baseline-supply`: the token supply the mint ledger starts from. Use the current `ft_total_supply` of a token that already has holders; `0` for a token minted only through the gate.

6. **Gate the mint** (token owner). Makes `pontis-core` the token's only minter: the owner `mint` and `faucet_mint` fail while a minter is set, so supply can only grow through `request_mint` / `execute_mint`, capped at the reserve headroom. Clearing the minter re-opens the owner path; the owner can always do that, which is the demo's accepted trust ([threat model](../threat-model)).

   ```bash
   pnpm --filter @pontis/scripts reserves set-minter tgold-a
   ```

7. **Run the simulated custodian.** One signed attestation per monitored representation linked to a custodian that holds the dev key, every `--interval-ms`.

   ```bash
   pnpm --filter @pontis/scripts reserves publish --loop --interval-ms 30000   # run it as a service
   pnpm --filter @pontis/scripts reserves publish                              # one round
   ```

   Each attestation sets `reserved_units = floor(ft_total_supply * cover / 10000)` from the token's real supply, `as_of_ms = now`, `report_hash = sha256` of a synthetic report text, `report_uri = sim://reserves/<representation>/<yyyy-mm>`. The cover defaults to 10 000 bps (fully covered; `--cover-bps` changes the default). `--custodian <id>` narrows it to one custodian. A refusal or a failed read is logged and the next round tries again; `--loop` survives errors. The same layout is pinned by `test-vectors/reserve-attestation.json`.

8. **Monitor.**

   ```bash
   pnpm --filter @pontis/scripts reserves status tgold-a        # on-chain status, link and the simulator's cover
   curl -s $API/v1/assets/tgold-a/reserves | jq                 # state, ratio, attested, circulating, headroom, per-custodian report
   psql "$DATABASE_URL" -c "select report from reserve_monitor_report"   # breaches, stale, last run (see "Reserve monitor")
   ```

   The status is computed on read from signed attestations and the contract's supply counters, so no job can write a favourable one. The indexer's [reserve monitor](#reserve-monitor-and-reconciler-findings) calls `refresh_supply` and `evaluate_reserve` once a minute; anyone may call them by hand (1 yoctoNEAR, not blocked by pause):

   ```bash
   near contract call-function as-transaction <core> refresh_supply json-args '{"representation_id":"tgold-a"}' \
     prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as <anyone> network-config testnet
   near contract call-function as-transaction <core> evaluate_reserve json-args '{"representation_id":"tgold-a"}' \
     prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as <anyone> network-config testnet
   ```

## Drift demo

`drift` records a cover ratio for one representation in `scripts/.reserves-state.json` (git-ignored; `RESERVES_STATE_FILE` moves it). A running `publish --loop` reads it every round, so no restart is needed.

```bash
pnpm --filter @pontis/scripts reserves drift tgold-a 9000    # from the next publish the simulated custodian attests 90 percent
pnpm --filter @pontis/scripts reserves drift tgold-a clear   # back to the --cover-bps default
```

With tolerance 0, supply above the attested reserve is `breached`: a `restrict_conversions` token refuses conversions in either direction (`RESERVE_RESTRICTED`) and a `pause_mint` token refuses gated mints. A fresh attestation at full cover reopens the route. Everything stays labelled simulated.

## When something is refused

| What you see                                                | Meaning                                                                                                                           | Do                                                                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESERVE_STALE` on a quote, state `stale`                   | The oldest latest attestation of an active linked custodian is older than `max_reserve_age_ms`                                    | Check that `reserves publish --loop` runs, the relayer has funds and the key is still registered; the next accepted attestation reopens the route                    |
| `RESERVE_STALE`, state `no_attestation`                     | No active linked custodian has attested yet (also: the custodian was suspended or the link replaced)                              | Run `reserves publish`; check `reserves status` for the skipped lines (unmonitored, no link, custodian not active, another key)                                      |
| `RESERVE_RESTRICTED`, state `breached`                      | Circulating supply exceeds attested reserve plus tolerance, from drift, supply created outside the gate, or a suspended custodian | Read `reserves status`; undo the drift, or publish at a cover that matches supply. Supply minted outside the gate shows up here by design (`refresh_supply`)         |
| Quotes work but the status says `breached` or `stale`       | The policy action is `warn`: the status and events flag it, nothing is refused                                                    | Intended; change the action with `set-policy` only deliberately                                                                                                      |
| `submit_reserve_attestation` refused (logged by `publish`)  | Not newer than the stored latest, custodian not linked or not active, key not the custodian's key, paused                         | Newer: the script already signs strictly newer times; wait for the clock. Otherwise fix the link, status or key ([Roles](#set-up-once-per-deployment-in-this-order)) |
| `request_mint` / `execute_mint`: `exceeds reserve headroom` | The mint would take supply above the attested reserve; no tolerance applies to minting                                            | Publish a higher cover, or mint less. `no reserve policy`: set a policy first                                                                                        |
| Everything refused while paused                             | A global or per-asset pause blocks attestations, mints, new redemptions, accept and fulfil; exits stay open                       | See the [pause procedure](pause.md)                                                                                                                                  |

## Redemption: terms

A redemption terms record is enforced data, set per representation by the registrar (not by a script here; example for a demo that lets the issuer's back-office act within a minute):

```bash
near contract call-function as-transaction <core> set_redemption_terms json-args '{
  "representation_id": "tgold-a",
  "terms": { "min_amount": "1000000", "max_amount": "0", "fee_bps": 25,
             "window_anchor_ms": 0, "window_length_ms": 0, "window_period_ms": 0,
             "accept_within_ms": 60000, "settlement_days": 1 } }' \
  prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as <registrar> network-config testnet
```

`accept_within_ms` is the issuer's time to accept (1 000 to 2 592 000 000), `settlement_days` the time to fulfil after accepting (1 to 30), `window_period_ms: 0` means always open. A user redeems by `ft_transfer_call` to the core with `msg = "redeem:<terms_hash>:<payout_instruction_hash>"` (the API's `POST /v1/redemptions/prepare` builds it); the whole amount is escrowed. `fee_units` and `net_units` are figures the simulated issuer owes off-chain. **Nothing is paid out**: on fulfilment the escrow is burned and that is all.

## Redemption: the simulated back-office

The back-office accepts and fulfils redemptions after delays, so a demo shows the whole lifecycle.

```bash
export BACKOFFICE_ACCOUNT_ID=<account in the issuer's controlled_accounts>
pnpm --filter @pontis/scripts backoffice --accept-after-ms 10000 --fulfil-after-ms 20000
```

- It polls `get_redemptions_by_representation` for the representations it serves: `--representation <id>` (repeatable), else every representation of the issuers given by `--issuer <id>` (repeatable, or `BACKOFFICE_ISSUER_IDS`), else every representation that has redemption terms. `--once` runs a single round; `--interval-ms` (default 5 000) sets the polling.
- A `requested` redemption older than `--accept-after-ms` is accepted (`accept_redemption`); an `accepted` one older than `--fulfil-after-ms` **since its acceptance** is fulfilled (`fulfil_redemption(id, evidence_hash)`), where `evidence_hash` is the sha256 of a synthetic receipt text (`SIMULATED fulfilment receipt: ...`). It does not try after a deadline has passed: the contract would refuse.
- A failed call is logged and retried on the next round; the loop survives errors.

**Account and key.** The contract accepts these calls only from an account in the `controlled_accounts` of the representation's issuer (an unproven registrar claim, a labelled mock, not authentication of an issuer; [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)). That list is set when the issuer is registered and the registry has no method to change it afterwards, so the operator has these options:

1. Register the demo issuer with the back-office account in `controlled_accounts` (a fresh deployment or a sandbox).
2. On the demo seed, which lists each issuer's token accounts, sign as one of those accounts (`BACKOFFICE_ACCOUNT_ID=tgold-a.<deployer>`) and add the dev `issuer-backoffice` key to it. **Anyone can recompute that key**, so while it is on the account anyone can sign as that token account: testnet synthetic tokens only, remove it when done.

   ```bash
   near account add-key tgold-a.<deployer> grant-full-access use-manually-provided-public-key \
     ed25519:6qm5vvyuMtoYmHtn4ccTcK4ncgrkDStpmofDFFKC1Veu network-config testnet
   ```

On a sandbox or a fresh deployment there is a third way that needs no key added: `deploy-testnet` creates each token account with the deployer's public key as a full-access key, so `BACKOFFICE_ACCOUNT_ID=<token account>` with `BACKOFFICE_PRIVATE_KEY=<the deployer key>` signs as that issuer account. The end-to-end `custody` scenario ([`tests/e2e`](../../tests/e2e/README.md)) does exactly this, and also drives every step of this runbook (set-up, attestation, mint, drift, redemption, expiry, reclaim) through the real contract, indexer and API on a sandbox. Its terms use `accept_within_ms: 25000` so the accept deadline passes inside a run; the fulfil deadline is `settlement_days` (at least a day) after acceptance and is not reachable in a sandbox run.

The key is `BACKOFFICE_PRIVATE_KEY` if set, else the account's NEAR credentials file, else the public dev key. The back-office prints a `skipped` line for every representation whose issuer does not list the account.

### Ignoring a redemption so it expires

`--ignore <id>` (repeatable) leaves that redemption untouched, in any state:

```bash
pnpm --filter @pontis/scripts backoffice --ignore 4 --ignore 7
```

Once `accept_deadline_ms` (for a `requested` one) or `fulfil_deadline_ms` (for an `accepted` one) passes, anyone may expire it, and the miss counts against the issuer's reliability record (`get_issuer_reliability`, shown by `GET /v1/issuers/{id}/reliability` labelled simulated):

```bash
near contract call-function as-transaction <core> expire_redemption json-args '{"id":4}' \
  prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as <anyone> network-config testnet
```

### Reclaim

The user gets the escrow back from a `rejected` or `expired` redemption with `reclaim_redemption(id)`; past a deadline it expires first, in the same call. The API's `POST /v1/redemptions/{id}/reclaim-intent` returns the unsigned action for the wallet. Reclaim, expire and reject are never blocked by pause. If the token call fails (for example the user was unregistered on the token), the redemption returns to its previous state and the reclaim can be retried.

```bash
near contract call-function as-transaction <core> reclaim_redemption json-args '{"id":4}' \
  prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as <the redemption's user> network-config testnet
```

## Redemption refusals

A refused transfer returns the whole amount and emits `redemption_refused` with one of these reasons; the API maps the common ones on `prepare`.

| Reason                                    | Meaning                                                                             | Do                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `TERMS_MISSING`                           | The representation has no redemption terms                                          | Set terms (above)                                                                      |
| `TERMS_CHANGED`                           | The `terms_hash` in the message is not the current one                              | Fetch the terms again and retry                                                        |
| `BELOW_MIN`, `ABOVE_MAX`, `WINDOW_CLOSED` | The amount or the time is outside the terms                                         | Change the amount, or wait for the window                                              |
| `TOO_MANY_OPEN`                           | The sender already has 20 open redemptions                                          | Wait for them to resolve or reclaim them                                               |
| `ASSET_NOT_REDEEMABLE`, `PAUSED`          | The representation is `paused` or `deprecated`, or the contract is paused           | An `active` or `restricted` asset can be redeemed; see the [pause procedure](pause.md) |
| `UNKNOWN_TOKEN`, `INVALID_MSG`            | The token is not a registered representation, or the `redeem:` message is malformed | Use the message from `prepare`                                                         |

## Reserve monitor and reconciler findings

Staleness changes with time and nothing on chain runs by itself, so the indexer runs a **reserve monitor** (`RESERVE_MONITOR_INTERVAL_MS`, default 60 s, 0 turns it off). For every representation that has a reserve policy it calls `refresh_supply` and `evaluate_reserve`, reads `get_reserve_status` and stores the result in `reserve_monitor_report` (last run, per-representation state, `breaches`, `stale`, `failed`; every figure `simulated`, `source: reserve_monitor`). A breach or staleness that was not in the previous pass is also written to `audit_log` (`reserve.breach`, `reserve.stale`). `GET /v1/admin/reserve-monitor` is not built yet: it arrives with the session and role task, as a call to `loadReserveMonitorReport(db)` from `@pontis/db`.

The monitor signs with `RESERVE_MONITOR_ACCOUNT_ID` and `RESERVE_MONITOR_PRIVATE_KEY` in the indexer's environment. Both calls are permissionless, so any funded testnet account works; it holds no role and no value, and the key is a plain environment variable: use a throwaway testnet account only. Leave both empty and the monitor only reads: the report then shows `signer: null` and the status can go stale for lack of a fresh `evaluate_reserve`, which the contract's route gate does not depend on.

The reconciler (every `RECONCILE_INTERVAL_MS`) raises these findings; read them in `GET /v1/admin/reconciliation`:

| Finding              | Meaning                                                                                                                                                          | What to do                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `RESERVE_BREACH`     | The contract says a monitored representation is `breached` and the mirror has not recorded a breach (two runs in a row): an event was missed or the indexer lags | Check the indexer cursor and `reserve_status`. A breach the mirror knows about is not a finding; read the monitor report and the status |
| `RESERVE_STALE`      | The oldest attestation is older than `max_reserve_age_ms`                                                                                                        | Start or fix `reserves publish --loop`; a `restrict_conversions` or `pause_mint` token refuses until a fresh attestation                |
| `REDEMPTION_OVERDUE` | A redemption is still `requested` or `accepted` over 5 minutes after its deadline                                                                                | Anyone may call `expire_redemption`; the user then calls `reclaim_redemption`. A running back-office never lets this happen             |
| `ESCROW_MISMATCH`    | Open escrows in the mirror, inventory and pending input do not add up to the core's token balance (two runs in a row)                                            | Compare `get_escrow_ledger` with the open redemptions; a missed event is repaired by re-reading blocks (`INDEXER_START_HEIGHT`)         |

Redemption escrow is counted in the vault reading (`GET /v1/admin/reconciliation`, `vaults[].inventory` includes it for representations with redemption terms), so a held escrow is not reported as an untracked balance.

## What this does not do

No fiat or custody transfer is modelled, no document is real (`sim://` URIs point nowhere), and the custodian and the issuer are test keys. A reserve policy set by the owner is a single point of trust until the multisig owner of a later phase ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md), consequences).
