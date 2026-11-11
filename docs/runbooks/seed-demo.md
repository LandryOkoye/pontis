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

## When it goes wrong

- **`<id> is not deployed: run deploy-testnet with --catalogue=<tier> first`.** The tokens of that tier do not exist yet: deploy with the same `--catalogue` value you seed with.
- **A transaction fails for lack of balance.** The deployer ran out of NEAR (token accounts) or `pontis-core` ran out of storage balance; the seed tops the core account up before it registers, so a failure there means the deployer cannot pay. Fund the deployer and run the step again: it continues where it stopped.
- **A pair is not approved.** By design some pairs are proposed or rejected (see the dossier of the claim). A pair whose issuer is `restricted` or `deprecated` stays approved and cannot convert: the contract executes only while the issuer is `active`.
- **`INSUFFICIENT_INVENTORY` on `tusd-h` to `tusd-s`.** Only `tusd-s` has a funded vault; the other direction is empty by design ([vault low](vault-low.md)).
- **The market has no history.** Run the registry sync first (the simulator reads the mirror), then `backfill`; it skips representations whose claim has no profile and says which.
- **Start over.** Contracts are redeployed, not reset: use a fresh sandbox, or a new deployer sub-account on testnet.
