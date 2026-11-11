# Phase 4: fictional custody, reserves and redemption in the demo catalogue

Fills the extension point the demo catalogue left for phase 4 ([phase 3 seed](phase-3-seed.md), [ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)): the Phase 4 screens look populated and tell different honest stories. Branch `feat/seed-custody`, on `main` after the rich catalogue. No Rust, no web app, nothing run against a chain. **Everything is fiction:** every custodian, reserve, policy, term and redemption is invented and labelled `simulated`; nothing is custodied, backed, audited, regulated or paid out.

## What was built

| Area      | Result                                                                                                                                                                                                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data      | `scripts/lib/catalogue-custody-*.ts`: 8 invented custodians, 35 custody links with a reserve story each, 19 redemption terms, 3 simulated redemptions, per tier (`custodyFor(tier)`). `PHASE_4_EXTENSION_POINT` is gone; custody attaches by id.                                                                                                               |
| Seed      | `seed-custody` (`scripts/seed-custody.ts`, `lib/seed-custody*.ts`): attester role and dev key, custodians, links, policies, one simulated attestation per story (the `reserves publish` code path and dev key), gated minters, terms, three redemptions. Each step reads chain state first. `demo:seed` runs it with `--custody` (on by default on a sandbox). |
| Tiers     | `mvp` has no custody (the end-to-end suite is unchanged); `demo` is 5 custodians, 6 tokens, 4 terms, 3 redemptions; `full` is 8 custodians, 35 tokens, every story, 19 terms.                                                                                                                                                                                  |
| Cost      | `catalogue-plan` prints the custody counts and a derived cost (demo 37 transactions, about 0.15 NEAR storage and 0.1 gas; full 142, about 0.68 and 0.3). A test checks the transaction count against a fake chain. Not measured.                                                                                                                               |
| Operators | `reserves publish --skip <representation>` (repeatable) leaves a story alone; the seed prints the exact command. `seedTokens` skips owner mints for a token whose minter is set, and exposes `ensureCoreRegistered`.                                                                                                                                           |
| Dossiers  | Each generated claim dossier has a "Custody, reserves and redemption (simulated)" section with the FICTIONAL DEMO DATA banner and an empty state where there is no custody (`pnpm --filter @pontis/scripts gen-dossiers`).                                                                                                                                     |
| Tests     | Plan tests over the Rust limits, stories and tiers; denylist of real custodians and audit firms; seed steps and the whole seed over a stateful fake chain, including idempotence; demo-seed arguments; cost; dossiers.                                                                                                                                         |

## The stories

`healthy` (cover 100 to 110 percent), `thin` (99.5 percent, inside a 1 percent tolerance), `breached` (92 percent, `restrict_conversions`), `stale` (5 minute max age, not refreshed), `warn_only` (97 percent, action `warn`), `pause_mint` (gated), `never_attested` (policy and link, no attestation). Which token tells which, and what the API shows, is in the [seed runbook](../runbooks/seed-demo.md#custody-reserves-and-redemption).

## Judgement calls

- **Single-custodian links.** The simulator attests each linked custodian at the full cover, so a multi-custodian link would add up to several times the supply. The contract allows four; the plan tests the cap but the data uses one.
- **The lapsing story is one token, with a 5 minute max age** (the contract's floor is 1 minute). The rest use a day, so they outlast a demo session but go stale without a publisher; documented as decay.
- **Never-attested and lapsing tokens need `--skip`.** Rather than inventing a custodian a publisher cannot sign for, `publish` gained `--skip`; the seed prints the command.
- **Two gated tokens.** A fulfilled redemption burns through `minter_burn`, which needs the core as minter, so `ttb3m-m` (the fulfilled one) and `tigc-r` (`pause_mint`) are gated; the owner mint and faucet close there, and `seedTokens` no longer tops up a gated token, else a re-run would fail after the burn.
- **The deployer plays holder and registrar; the issuer's token account signs accept and fulfil** with the deployer's key (the deploy created the token accounts with it). Test accounts in a demo, listed as T125.
- **The custodian called Quillfeather collided with an existing fictional share** and was renamed Ferncliff; a test now refuses a custodian whose first word appears in an issuer, claim or token name.
- **Generated dossiers change hash.** The claim dossiers are evidence on chain; a chain seeded before this change holds the older hashes. Hand-written dossiers of the phase 1 claims have no custody section.
- **`demo:seed` seeds custody only on a sandbox by default,** because on a public testnet it is a few dozen more transactions; `--custody` opts in.

## Not done

- No sandbox or testnet run, no e2e, no deploy: chain-facing steps are tested over a fake chain only, so the contract-facing argument shapes (`get_redemptions_by_user`, `get_reserve_attestation`, `set_redemption_terms`) are checked against the Rust source by reading, not by a call.
- Historical redemptions: the chain has no clock to travel, so only three live states are seeded.
- The indexer and API were not run against the seeded data.
- `docs/runbooks/README.md` fails `prettier --check` on `main` and was left alone.

## Run

```bash
pnpm --filter @pontis/scripts catalogue-plan
pnpm --filter @pontis/scripts seed-custody --catalogue=demo
pnpm demo:seed --catalogue=full --sandbox-info /tmp/sandbox.json
pnpm --filter @pontis/scripts reserves publish --loop --skip teur-m --skip tmmfeur-c
```
