# Corporate actions, lifecycle and NAV strikes

A corporate action (a split, a reverse split, a merger...) changes what one token unit is worth in the asset's canonical unit. Pontis records the action on chain, freezes the routes of the asset around it, and lets each wrapper's issuer apply the exact approved factor to its own multiplier ([ADR 0017](../decisions/0017-corporate-actions-and-multiplier-epochs.md)). Lifecycle stages, the `no_conversion` flags and NAV strikes ([ADR 0018](../decisions/0018-asset-lifecycle-and-nav-strikes.md)) are operated from the same CLI. Everything on the demo is synthetic.

```bash
pnpm --filter @pontis/scripts actions            # prints the command list
```

Registrar commands sign as the deployer account (the `registrar` role). `approve`, `cancel` and `approve-delist` need a `compat_approver` who is **not** the account that proposed or requested, so set a second account that holds that role before them:

```bash
export APPROVER_ACCOUNT_ID=approver.testnet          # and APPROVER_PRIVATE_KEY, or its NEAR credentials file
```

Without it those commands sign as the deployer, and the contract refuses them if the deployer proposed. Times are epoch milliseconds or ISO 8601 with a zone (`2026-11-20T14:30:00Z`). Every command attaches the 1 yoctoNEAR the contract requires.

## A split, from proposal to settlement

Example: asset `syn-stock` has two wrappers, `tstock-a` and `tstock-b`, and a 2-for-1 split takes effect at 2026-11-20 14:30 UTC. Every wrapper's multiplier is multiplied by the change, so `2/1` doubles it.

1. **Propose** (registrar). The freeze window must contain the effective time and may not start before the announcement. The command prints the action id, `syn-stock-1` here.

   ```bash
   pnpm --filter @pontis/scripts actions propose syn-stock split \
     --announced 2026-11-01T00:00:00Z --ex-date 2026-11-20T00:00:00Z --effective 2026-11-20T14:30:00Z \
     --freeze-from 2026-11-20T12:00:00Z --freeze-until 2026-11-20T18:00:00Z --multiplier 2/1
   ```

   A `split` or `reverse_split` needs `--multiplier`; `dividend_cash`, `symbol_change` and `custom` refuse it.

2. **Evidence** (registrar). The hash is the SHA-256 of the notice or dossier. `third_party_attested` is allowed; `independently_verified` is not, because no verifier exists in this MVP.

   ```bash
   pnpm --filter @pontis/scripts actions add-evidence syn-stock-1 --uri docs/asset-dossiers/syn-stock.md \
     --sha256 "$(sha256sum docs/asset-dossiers/syn-stock.md | cut -d' ' -f1)" \
     --description "Synthetic split notice, self-attested by the project"
   ```

3. **Approve** (second compat approver, only before `--effective`). The proposer cannot approve their own action.

   ```bash
   pnpm --filter @pontis/scripts actions approve syn-stock-1 --rationale "notice matches the dossier"
   ```

   A wrong proposal is withdrawn with `actions cancel syn-stock-1 --reason "..."` (compat approver), also before it takes effect.

4. **Freeze window.** Between `--freeze-from` and `--freeze-until` every route that touches the asset is refused with `CORPORATE_ACTION_FREEZE`. Quotes whose expiry would cross the next freeze are clamped to it. Nothing needs doing.

5. **Apply per wrapper** (registrar, once the effective time has passed). The new multiplier must equal the multiplier in force at the effective time times the approved change, exactly; the contract refuses any other number. For a wrapper of 6 decimals whose multiplier was `1/1000000`:

   ```bash
   pnpm --filter @pontis/scripts actions apply syn-stock-1 tstock-a --multiplier 2/1000000
   pnpm --filter @pontis/scripts actions apply syn-stock-1 tstock-b --multiplier 2/1000000000
   ```

   Pass the ratio in lowest terms (`1/500000` for `2/1000000`). Each apply appends a multiplier epoch and bumps the version of every relationship of that wrapper, which voids older quotes (`COMPATIBILITY_CHANGED`). When every live wrapper has applied, the action becomes `applied`.

6. **Settle** (registrar). For an action with no multiplier change (a cash dividend, a symbol change) there is nothing to apply; settle it once the effective time has passed. For one with a change, settle works only after every live wrapper has applied, and is rarely needed because the last `apply` already closed it.

   ```bash
   pnpm --filter @pontis/scripts actions settle syn-stock-2
   ```

Check the state at any time (read-only; replace `<core>`):

```bash
near contract call-function as-read-only <core> get_corporate_actions json-args '{"asset_id":"syn-stock"}' network-config testnet now
near contract call-function as-read-only <core> get_multiplier_epochs json-args '{"representation_id":"tstock-a"}' network-config testnet now
```

## What a closed route looks like

`GET /v1/routes/{from}/{to}/guards` and every quote carry the reason code. The state behind it is served by `GET /v1/assets/{id}/lifecycle`, `/corporate-actions` and `/nav`.

| Reason code                | Meaning                                                                                     | Do                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CORPORATE_ACTION_FREEZE`  | An approved action of either asset is inside its freeze window                              | Wait for `freeze_until_ms`; if it was mistaken, cancel the action before it takes effect                                                                                                                            |
| `CORPORATE_ACTION_PENDING` | The action is effective, but some wrapper has not applied its multiplier change yet         | Run `actions apply` for each wrapper listed as not applied; the route stays closed until every one has, by design                                                                                                   |
| `EPOCH_MISMATCH`           | The ratio of the two live multipliers is no longer the one the relationship was approved on | Common after a non-uniform change (one wrapper redenominated, the other not): a compat approver re-proposes and approves the pair at the new ratio. A uniform split keeps the ratio and the route resumes by itself |
| `NOT_CONVERTIBLE`          | The representation has `no_conversion` or `bridge_only` set                                 | Intended; clear it with `actions set-flags` only while the stage is `active`                                                                                                                                        |
| `LIFECYCLE_BLOCKED`        | The stage is not `active` (`matured`, `redeeming`, `redeemed`, `delisted`)                  | Intended; holders exit through redemption, not conversion                                                                                                                                                           |
| `NAV_WINDOW_CLOSED`        | A `nav_fund` has no strike, or the window of its latest strike is over                      | Submit a new strike (below)                                                                                                                                                                                         |

## `CORPORATE_ACTION_OVERDUE`

The indexer's reconciler raises this warning, once per action, for an `approved` action with a multiplier change that took effect more than 10 minutes ago while a live wrapper (neither `rejected` nor `deprecated`) is missing from `applied_representations`. The message names the wrappers and how long the action is overdue. Read `get_corporate_actions` (or `GET /v1/assets/{id}/corporate-actions`, which lists each wrapper as `applied` or not), then run `actions apply` for each wrapper that has not applied; if a wrapper will never apply, deprecate it and `settle` the action. The finding clears on the next reconciliation once every live wrapper has applied. An approved action cannot be cancelled once a wrapper has applied it, so the way out is to apply or settle it.

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_KEY" $API/v1/admin/reconciliation | jq '.findings[] | select(.kind=="CORPORATE_ACTION_OVERDUE")'
```

## Lifecycle stage and flags

```bash
pnpm --filter @pontis/scripts actions set-flags tfund-a nav_fund            # kind, only while active; add --no-conversion or --bridge-only
pnpm --filter @pontis/scripts actions set-stage tnote-a matured --note "term ended"   # term_instrument only; optional --evidence-hash
```

`--bridge-only` implies `--no-conversion`. Setting flags bumps the version of the representation's relationships, which voids older quotes. `set-stage` refuses `delisted` and `nav_strike_window`.

## Delisting needs two accounts

```bash
pnpm --filter @pontis/scripts actions request-delist tfund-a --note "fund wound up" --evidence-hash <sha256>   # registrar
APPROVER_ACCOUNT_ID=approver.testnet pnpm --filter @pontis/scripts actions approve-delist tfund-a             # compat approver, not the requester
```

A new request replaces an unapproved one. The requester cannot approve; the contract says so. Once delisted the stage accepts nothing further, and the route reports `LIFECYCLE_BLOCKED`.

## Simulated NAV strikes

A `nav_fund` converts only inside the window `[as_of_ms, cutoff_ms)` of its latest strike, and the strike's NAV is the fund's reference price. There is no real administrator on the demo, so the strike is made here, **always labelled `simulated: true`, source `simulated_feed`**, signed by the dev price-publisher key (`pnpm --filter @pontis/scripts guards register-publisher` registers it). Nothing here makes a NAV real.

```bash
pnpm --filter @pontis/scripts actions nav tfund-a                          # the simulator's NAV now, window 24 hours
pnpm --filter @pontis/scripts actions nav tfund-a --nav 1.0234 --window-hours 6   # a chosen NAV (8 decimals)
```

The strike is as of now and open until now plus the window (1 to 168 hours; the contract allows at most 7 days). A strike must be newer than the last one, so run it again for the next window. If the simulator has no NAV for the representation, `--nav` is required. The layout of the signed message is `b"pontis-nav-v1" ++ borsh(payload)`, pinned by `test-vectors/nav-strike.json`. Read the strike with `GET /v1/assets/tfund-a/nav`.
