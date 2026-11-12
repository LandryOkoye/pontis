# Seed the demo catalogue and its simulated market

**Symptom:** the directory is empty, a tier is half loaded, the charts have no history, or an operator wants a bigger or smaller demo. Everything this loads is fictional: every issuer, claim and token is invented, every record is `synthetic` and at most `issuer_attested`, and every price, NAV, supply and trade is `simulated` ([ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)).

## Choose a tier and price it

```bash
pnpm --filter @pontis/scripts catalogue-plan                  # NEAR, transactions and assumed time of mvp, demo and full
```

`mvp` seeds nothing beyond the MVP pair, `demo` (the default) is 26 tokens, `full` is 53. Each token is a deployed account funded with 2.80 NEAR on the slim build; the deployer must hold the total plus gas ([local setup](../local-setup.md#seed-the-demo-catalogue-optional)). A sandbox needs no NEAR.

## Load everything on a sandbox

1. Start the sandbox and Postgres (`pnpm db:up`).
2. `DATABASE_URL=... pnpm demo:seed --catalogue=full --sandbox-info /tmp/sandbox.json`.
3. Keep the quote-signer key it prints; it is the only copy.

**Confirm:** `curl "$API/v1/assets?limit=100" | jq .total` shows the tier's representation count (plus the two MVP tokens), every `market` figure in the list says `simulated: true`, and `pnpm --filter @pontis/scripts ops status` shows the vaults.

## Load or repeat one step by hand (testnet or sandbox)

Pass the same tier to each step; every step reads current state first, so repeating one is safe.

```bash
pnpm --filter @pontis/scripts deploy-testnet --catalogue=full   # token accounts (without the flag the record keeps only the MVP rows)
pnpm --filter @pontis/scripts seed                              # MVP registry, quote signer
pnpm --filter @pontis/scripts seed-catalogue --catalogue=full   # registry, relationships, guards, supply, vaults, final statuses
pnpm --filter @pontis/api sync                                  # mirror the registry into Postgres
pnpm --filter @pontis/scripts seed-profiles --catalogue=full    # off-chain profiles
pnpm --filter @pontis/simulator start backfill                  # simulated history
```

## Custody, reserves and redemption

**Everything here is fiction.** `seed-custody` attaches invented custodians, reserve policies, simulated attestations, redemption terms and three simulated redemptions to the catalogue by id (data in [`scripts/lib/catalogue-custody-*.ts`](../../scripts/lib)). Nothing is custodied, backed, audited, regulated or paid out; [ADR 0020](../decisions/0020-custody-reserves-and-redemption.md), [reserves runbook](reserves-and-redemption.md).

```bash
pnpm --filter @pontis/scripts seed-custody --catalogue=demo     # after seed and seed-catalogue of the same tier
pnpm demo:seed --catalogue=full --sandbox-info /tmp/sandbox.json   # custody is on by default on a sandbox; --no-custody skips it
pnpm demo:seed --catalogue=demo --testnet --custody                # opt in on a public testnet
```

`demo:seed` seeds custody for `demo` and `full` when `--sandbox-info` is given, and only with `--custody` otherwise; `mvp` has none (the end-to-end suite seeds only the MVP pair). `catalogue-plan` prints the custody counts and cost of each tier. The indexer mirrors the custody events into Postgres once it runs.

| Tier   | Custody set                                                                       | Transactions | Storage + gas (NEAR) | Time, testnet / sandbox |
| ------ | --------------------------------------------------------------------------------- | ------------ | -------------------- | ----------------------- |
| `mvp`  | none                                                                              | 0            | 0                    | none                    |
| `demo` | 5 custodians, 6 tokens, 4 redemption terms, 3 redemptions                         | 37           | about 0.15 + 0.1     | about 2 min / 1 min     |
| `full` | 8 custodians, 35 tokens, every story, 19 redemption terms, the same 3 redemptions | 142          | about 0.68 + 0.3     | about 6 min / 2 min     |

These are estimates derived from the plan (a unit test checks the transaction count against a fake chain); **nothing was measured on a chain**, and the latencies are assumed.

**What the steps do, in order** (each reads chain state first): the owner grants `reserve_attester` to `custodian-sim.<deployer>` and registers the dev key with scope `reserves` (the deployer stays the registrar: the two roles never meet); the registrar registers the custodians and links each token; the owner sets each policy with the token's supply as baseline; the simulated custodian attests once per story through the same code as `reserves publish`; `pontis-core` becomes the minter of the two gated tokens; the registrar sets the terms; the deployer requests three redemptions and the issuer's token account accepts and fulfils two of them.

**The stories** (the demo tier tells the first four):

| Story            | Token (demo in bold)                           | What the API shows                                                    |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| `healthy`        | **`tmmfusd-m`, `tgkg-a`, `tcbn-v`**, many more | `ok`, cover 100 to 110 percent                                        |
| `thin`           | **`ttb3m-m`**, `tcu-d`                         | `ok`, attested a little under supply but inside a 1 percent tolerance |
| `breached`       | **`tgkg-d`**                                   | `breached`, 92 percent cover, routes refused `RESERVE_RESTRICTED`     |
| `stale`          | **`teur-m`**                                   | `ok` for 5 minutes, then `stale`, routes refused `RESERVE_STALE`      |
| `warn_only`      | `tmmfusd-e`                                    | `breached` but the action is `warn`: flagged, nothing refused         |
| `pause_mint`     | `tigc-r` (gated)                               | `ok`; a breach would also stop gated mints                            |
| `never_attested` | `tmmfeur-c`                                    | `no_attestation`, routes refused `RESERVE_STALE`                      |

No custody on purpose (the UI shows its empty state): `tacme-h`, `tqfb-p`, `tidxg-*`, `tbskt-*`, `tart-m`, `tflat-m`, and the tokens of unverified issuers.

**The stories decay; keep them alive or let them lapse.** `teur-m` goes stale within minutes of the seed on purpose. Every other attestation goes stale after a day unless the simulated custodian runs, and a publisher that attests everything also repairs `teur-m` and `tmmfeur-c`. Run it with the seed's `--skip` list (the seed prints this line):

```bash
pnpm --filter @pontis/scripts reserves publish --loop --skip teur-m --skip tmmfeur-c
```

The seed writes each story's cover into `scripts/.reserves-state.json`, so the loop keeps the breached and thin tokens breached and thin. `reserves drift <representation> clear` or a re-seed with a different cover changes it. Re-running `seed-custody` refreshes an attestation once half its max age has passed (never the lapsing one) and changes nothing else.

**The three redemptions** (demo and full, all simulated, nothing paid out): `tgkg-a` left `requested`, `tmmfusd-m` `accepted`, `ttb3m-m` `fulfilled` (escrow burned; that token is gated for the burn). Do not run `backoffice` against `tgkg-a` unless you want it accepted: start it with `--ignore <id>` or `--representation` on other tokens.

## When it goes wrong

- **`<id> is not deployed: run deploy-testnet with --catalogue=<tier> first`.** The tokens of that tier do not exist yet: deploy with the same `--catalogue` value you seed with.
- **A transaction fails for lack of balance.** The deployer ran out of NEAR (token accounts) or `pontis-core` ran out of storage balance; the seed tops the core account up before it registers, so a failure there means the deployer cannot pay. Fund the deployer and run the step again: it continues where it stopped.
- **A pair is not approved.** By design some pairs are proposed or rejected (see the dossier of the claim). A pair whose issuer is `restricted` or `deprecated` stays approved and cannot convert: the contract executes only while the issuer is `active`.
- **`INSUFFICIENT_INVENTORY` on `tusd-h` to `tusd-s`.** Only `tusd-s` has a funded vault; the other direction is empty by design ([vault low](vault-low.md)).
- **The market has no history.** Run the registry sync first (the simulator reads the mirror), then `backfill`; it skips representations whose claim has no profile and says which.
- **`<id> is not registered: run seed-catalogue --catalogue=<tier> first`.** The custody step needs the catalogue of the same tier on chain first.
- **`... is a registrar: a registrar cannot also be a reserve attester`.** The role-holder account for the simulated custodian is `custodian-sim.<deployer>`; if it was made a registrar, revoke that role (the owner holds it) and run the step again.
- **A redemption request is refused (`the core refused the redemption request`).** The terms hash or the amount or window changed under it; `seed-custody` read the terms just before, so check `get_redemption_terms` and the token balance of the deployer.
- **A pair stopped converting after the custody seed.** By design: a `breached`, `stale` or `no_attestation` token with `restrict_conversions` refuses routes. `reserves status <id>` says why.
- **Start over.** Contracts are redeployed, not reset: use a fresh sandbox, or a new deployer sub-account on testnet.
