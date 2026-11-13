# Pontis

**The equivalence layer for tokenized real-world assets, built on NEAR.**

Pontis lets a holder convert one issuer's token into another issuer's token for the same underlying claim, at a reviewed parity ratio, in one wallet signature. A conversion executes only when an on-chain registry says the two tokens are equivalent, the holder is eligible for both, and the reserve and price guards pass. Otherwise the contract refuses and returns the input.

> **Testnet and synthetic assets only.** Every asset, issuer, custodian, price and reserve figure in this repository is fictional. Nothing is backed, custodied, verified or redeemable.

| Item           | Value                                                |
| -------------- | ---------------------------------------------------- |
| Hackathon      | Built at NEAR HACKATHON (1 to 14 November 2026)      |
| Tracks         | Unstoppable DeFi                                     |
| Demo post (X)  | `<FILL_IN: https://x.com/.../status/...>`            |
| Demo video     | `<FILL_IN: video URL>`                               |
| Hosted web app | `<FILL_IN: URL, or "none: run locally, see Try it">` |
| Hosted API     | `<FILL_IN: URL, or "none: run locally, see Try it">` |
| Network        | NEAR Testnet                                         |
| Core contract  | `pontis-core.pontis.testnet`                         |
| License        | MIT                                                  |

## Contents

1. [The problem](#the-problem)
2. [What Pontis does](#what-pontis-does)
3. [Why now](#why-now)
4. [How NEAR fits in](#how-near-fits-in)
5. [Deployed contracts](#deployed-contracts)
6. [Try it](#try-it)
7. [What is real and what is simulated](#what-is-real-and-what-is-simulated)
8. [Architecture](#architecture)
9. [Where Pontis is weak](#where-pontis-is-weak)
10. [What comes next](#what-comes-next)
11. [Hackathon disclosures](#hackathon-disclosures)
12. [Repository layout](#repository-layout)
13. [Development](#development)
14. [Documentation](#documentation)

## The problem

Tokenized real-world assets are growing, and they are fragmenting as they grow.

- **The market is large.** About $40B of tokenized RWAs are in circulation, excluding stablecoins, including $14B of tokenized U.S. Treasury funds and $3.9B of tokenized stocks (rwa.xyz, 11 November 2026).
- **The same asset exists as many tokens.** Circle's stock trades as `CRCLB` from one issuer and `CRCLon` from another. One independent count found 12,062 stock tokens from six issuers on seven chains.
- **Those tokens cannot be exchanged for each other.** A holder of issuer A's token who wants issuer B's token sells one and buys the other, paying two spreads and taking price risk in between. No published parity exists between them.
- **A ticker does not make two tokens the same claim.** One issuer's token is a total-return tracker, another is a debt security with no rights against the company, a third is a legal share. Unit conventions differ too: one audit found tokens whose on-chain balance changed by the square of a split ratio.
- **Issuers restrict who may hold them.** Allowlists, KYC and jurisdiction rules mean a generic swap pool cannot move these tokens.

Bridges and omnichain token standards move one token between chains. Nothing we found maintains a reviewed, versioned record of which tokens from different issuers are the same claim, and converts between them under each issuer's rules. The sources, the competitor table and the limits of that search are in [`docs/market-context.md`](docs/market-context.md).

## What Pontis does

Pontis treats equivalence as data that someone must review and sign off, not something inferred from a ticker or a price.

1. **Registry.** Issuers, the underlying claims and each token representation are registered on chain with evidence and a trust status.
2. **Compatibility review.** A reviewer classifies a pair of representations (for example `DIRECT_EQUIVALENT`) with a ratio and a written rationale. The contract checks the ratio against each token's unit definition. Relationships are versioned and can be suspended.
3. **Guards.** A route is executable only while both assets are active and unpaused, the holder is on each token's allowlist, the reserve attestation is fresh and sufficient, and the signed reference price is inside the pair's limits.
4. **Quote.** The API returns an ed25519-signed quote that expires after 60 seconds. It returns unsigned wallet actions and never holds a user key.
5. **Conversion.** The holder signs one `ft_transfer_call`. The contract re-checks every guard, pays out from the vault and refunds the whole input if anything fails.
6. **Proof it happened.** An indexer follows final blocks and settles the quote from contract events. A reconciler compares vault inventory and escrow with token balances.

Around that core, this repository also contains:

- **Custody, proof of reserve, gated mint and redemption.** Custodians sign reserve attestations, mint is capped by attested headroom, and a shortfall restricts the route.
- **Corporate actions.** Splits and distributions change a token's unit multiplier through versioned epochs, so the parity ratio stays correct.
- **Wallet sign-in for operators.** NEP-413 signed challenges, with roles read from the contract.
- **Collateral eligibility and lending.** A provider-neutral module decides whether a token is acceptable collateral and builds unsigned lending transactions, with a Morpho Blue adapter.
- **A NEAR Intents adapter and a private RFQ matcher.** The adapter defaults to a local simulator and can request live, dry mainnet quotes; the RFQ matcher is local.
- **A web app** covering the registry, comparison, conversion, activity, wallet and reconciliation.

## Why now

- **Issuance is ahead of interoperability.** Tokenized stocks from the six largest issuers grew from $585M at the end of 2025 to $3.2B by October 2026. Every new issuer adds another token for the same companies.
- **Venues are adapting to restricted assets.** Uniswap has shipped permissioned pools for allowlisted tokens, with Superstate and Securitize as launch partners. Permissioned liquidity is now an accepted pattern, but it prices on a curve and does not convert at parity.
- **NEAR already distributes tokenized stocks.** near.com sells Ondo stocks and ETFs through NEAR Intents, funded from more than 30 chains. That route reaches one issuer's tokens at a market price. Converting between issuers is the adjacent step that is still missing.

## How NEAR fits in

NEAR is where equivalence, eligibility and settlement are decided. Postgres and the API are a cache and a convenience; the contract is the authority.

| NEAR feature                               | What Pontis uses it for                                                                                                                                                                                                                                                                                                                                     | Where                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Rust smart contracts (`near-sdk`)          | Registry, compatibility, policy, guards, custody, reserves, redemption, vault and roles: about 18,000 lines of Rust including tests                                                                                                                                                                                                                         | `contracts/pontis-core`                              |
| NEP-141 and `ft_transfer_call`             | The whole conversion is one user signature. `ft_on_transfer` verifies and pays out, and the token's resolve step refunds the input on any refusal                                                                                                                                                                                                           | `contracts/pontis-core/src/conversion.rs`            |
| On-chain `ed25519_verify`                  | The contract verifies quote signatures, price attestations and reserve attestations itself, so a compromised API alone cannot settle a forged quote                                                                                                                                                                                                         | `quote.rs`, `price.rs`, `signers.rs`                 |
| Named accounts and sub-accounts            | Each token is its own readable account under the deployer, for example `tgold-a.<deployer>.testnet`; issuers list the accounts they control                                                                                                                                                                                                                 | `scripts/deploy-testnet.ts`                          |
| NEP-413 signed messages                    | Operators sign in with a wallet. The API reads their roles from the contract; there is no password                                                                                                                                                                                                                                                          | `apps/api/src/auth`, `docs/research/nep-413-auth.md` |
| Contract events (`EVENT_JSON`)             | The indexer settles quotes from events in final blocks, and the reconciler checks the database against the chain                                                                                                                                                                                                                                            | `apps/indexer`                                       |
| Cross-contract calls and promise callbacks | Payout, mint gating, supply reads and redemption escrow are multi-receipt flows with explicit failure handling                                                                                                                                                                                                                                              | `token_calls.rs`, `mint_gate.rs`, `redemption_*.rs`  |
| NEAR Intents (1Click API)                  | `/tokens`, dry `/quote` and `/status`; the simulator remains default, and explicit live mode reads the mainnet API. A 10 USDC NEAR-to-Arbitrum quote was returned through the API with `simulated: false`                                                                                                                                                   | `packages/intents-private`, `apps/api`, `apps/web`   |
| Chain Signatures                           | A NEAR Testnet account requested an MPC signature for a Sepolia `bridgeMint`; the derived address sent the confirmed transaction. See [NEAR `sign`](https://testnet.nearblocks.io/txns/4e621UTXZodn3y2KyuiGG2q5zdHNWPazRV7k5PMqS79G) and [Sepolia mint](https://sepolia.etherscan.io/tx/0x10ca45183afca9a266676b2f1342f126dbce60d6bb93d92c774acb0bd84d7c90) | `scripts/sepolia-token.ts`                           |
| Wallet Selector                            | MyNearWallet and Meteor sign the conversion in the web app's live mode                                                                                                                                                                                                                                                                                      | `apps/web/src/wallet`                                |
| `near-workspaces` sandbox                  | Contract integration tests, gas measurements and the full end-to-end run use a local chain, so CI never depends on a public RPC                                                                                                                                                                                                                             | `contracts/integration-tests`, `tests/e2e`           |

**Why NEAR and not another chain.** The conversion needs a single-signature flow across two token contracts with a guaranteed refund, cheap signature verification inside the contract, and human-readable accounts that issuers can be bound to. NEAR's `ft_transfer_call` callback model, host-level `ed25519_verify` and named sub-accounts provide all three without extra infrastructure. NEAR Intents is the natural path for the cross-chain leg later.

**What is not used yet.** The Chain Signatures flow is a script-driven demonstration, not part of `pontis-core` and not a bridge. Omni Bridge is researched but unused. Confidential Intents is not called. The standalone EVM token is not connected to `pontis-core`.

## Deployed contracts

NEAR Testnet. The deploy script writes the same information to [`docs/architecture/deployment-record.md`](docs/architecture/deployment-record.md).

| Contract                    | Account                          | Explorer                                                                       |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| Owner and deployer          | `pontis.testnet`                 | [nearblocks](https://testnet.nearblocks.io/address/pontis.testnet)             |
| `pontis-core`               | `pontis-core.pontis.testnet`     | [nearblocks](https://testnet.nearblocks.io/address/pontis-core.pontis.testnet) |
| `synthetic-token` (TGOLD-A) | `tgold-a.pontis.testnet`         | [nearblocks](https://testnet.nearblocks.io/address/tgold-a.pontis.testnet)     |
| `synthetic-token` (TGOLD-B) | `tgold-b.pontis.testnet`         | [nearblocks](https://testnet.nearblocks.io/address/tgold-b.pontis.testnet)     |
| Demo catalogue tokens       | Sub-accounts of `pontis.testnet` | [nearblocks](https://testnet.nearblocks.io/address/pontis.testnet)             |

The live NEAR Intents quote is a dry 1Click API response with no persistent explorer link; see [Path E](#path-e-a-live-near-intents-quote-dry-run-no-deposit). The Chain Signatures demo token and its transaction evidence:

| Contract / transaction    | Network          | Evidence                                                                                                                     |
| ------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PermissionedBridgeToken` | Ethereum Sepolia | [Token contract](https://sepolia.etherscan.io/address/0x84393560bc91a1c2edea435dfdb704ad17df0886)                            |
| Token deployment          | Ethereum Sepolia | [Deployment transaction](https://sepolia.etherscan.io/tx/0xe8252e2b47febe61011ddd6414d901458195bb888fd74e3fed60a0fff32af3c8) |
| Recipient allowlist       | Ethereum Sepolia | [Allowlist transaction](https://sepolia.etherscan.io/tx/0x21b94f8badf192c63e04c8ace9f52bf7498ecd0fcbc28205103f587c38632ec2)  |
| NEAR MPC `sign` request   | NEAR Testnet     | [Transaction](https://testnet.nearblocks.io/txns/4e621UTXZodn3y2KyuiGG2q5zdHNWPazRV7k5PMqS79G)                               |
| Signed `bridgeMint`       | Ethereum Sepolia | [Successful mint](https://sepolia.etherscan.io/tx/0x10ca45183afca9a266676b2f1342f126dbce60d6bb93d92c774acb0bd84d7c90)        |

Derived EVM address: `0xCd578f02BB4d8b12EBB0874bBfa08783d087f609`. Derivation path: `pontis-sepolia-mint-v1`.

| Evidence                                  | Value                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Deployment date                           | 2026-11-09                                                                                         |
| `pontis-core` wasm sha256                 | `75e23e78dbb64254d9653f3ea84a9c1120b4b780a20b799d446c57e4a41d99ad`                                 |
| A settled conversion (`ft_transfer_call`) | [`86Sbcmke…57KM`](https://testnet.nearblocks.io/txns/86Sbcmke83CpHYHTNWAXaUT9vX1Sz8FZkHhNGMR157KM) |

EVM contracts for the lending module and the bridge foundation:

| Contract                        | Network          | Address                                                                                                                         |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Morpho Blue core used by Pontis | Ethereum Sepolia | not deployed                                                                                                                    |
| Mock collateral tokens          | Ethereum Sepolia | not deployed                                                                                                                    |
| Mock loan tokens                | Ethereum Sepolia | not deployed                                                                                                                    |
| `PermissionedBridgeToken`       | Ethereum Sepolia | [`0x84393560bc91a1c2edea435dfdb704ad17df0886`](https://sepolia.etherscan.io/address/0x84393560bc91a1c2edea435dfdb704ad17df0886) |

## Try it

Six paths, from fastest to most complete. Each step says what to do and what you should see.

### Path A: read the live contract (30 seconds, needs only `curl` and `jq`)

Set the core account from the table above, then call a view method through a public RPC:

```bash
CORE=pontis-core.pontis.testnet

curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"query",
  "params":{"request_type":"call_function","finality":"final",
            "account_id":"'$CORE'","method_name":"get_fee_bps","args_base64":"e30="}
}' | jq -r '.result.result | implode'
```

- **See:** the conversion fee in basis points, read from the deployed contract.
- **Also try:** `get_quote_signer` in place of `get_fee_bps`. The other views (`list_issuers`, `list_canonical_assets`, `list_representations`, `list_compatibilities`, `get_route`, `get_inventory`) are defined in [`contracts/pontis-core/src`](contracts/pontis-core/src).

### Path B: the web app in mock mode (2 minutes, needs only Node 22 and pnpm)

No chain, no database, no backend. The API is served from fixtures in the browser and the wallet is simulated.

```bash
pnpm install
pnpm --filter @pontis/web dev
```

1. Open `http://localhost:5173`. **See:** the landing page.
2. Open `/app`. **See:** registry statistics, vault depth and the compatibility matrix, with every record labelled synthetic.
3. Open `/app/compare` and pick TGOLD-A and TGOLD-B. **See:** the classification `DIRECT_EQUIVALENT`, the ratio and the reviewer's rationale.
4. Connect the simulated wallet as `alice.testnet`, open `/app/convert` and enter an amount. **See:** a signed quote with a 60-second countdown, the fee and the amount out.
5. Sign. **See:** the conversion appear under `/app/activity` with its timeline and contract events.
6. Disconnect, connect as `guest.testnet` and request a quote. **See:** a refusal with `NOT_ELIGIBLE` and no quote.

### Path C: the whole system on a local chain (one command, about 3 minutes after the first build)

This is the path that proves the product. It starts a NEAR sandbox, deploys and seeds the contracts, starts the API and the indexer on a throwaway database, and drives the product through them with real signed transactions.

Needs Node 22, pnpm, Docker, the Rust toolchain and `wasm-opt` (binaryen).

```bash
pnpm install --frozen-lockfile
pnpm db:up
export DATABASE_URL=postgres://pontis:pontis@localhost:5432/pontis
scripts/build-contracts.sh slim
pnpm --filter @pontis/e2e e2e
```

- **See:** each scenario run in turn, then `All steps passed in <n>s.` and exit code 0. On failure it prints where the API, indexer and sandbox logs are.

| Scenario               | What it shows                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog                | Both assets are listed as synthetic and unverified; the pair is an approved `DIRECT_EQUIVALENT` and executable                                                  |
| Conversion             | The quote matches the shared integer math; a signed transfer settles through the indexer; balances move by exactly the quoted amounts; a replay is refused      |
| Refusals               | A non-allowlisted account, a pair with no relationship, a suspended pair and an expired quote are each refused, by the API and by the contract                  |
| Reconciliation         | Vault inventory equals the tokens held; a stray direct transfer and a stuck submission are both reported                                                        |
| Wallet sign-in         | A NEP-413 challenge is signed; the session carries the owner role; an account with no role gets `403`                                                           |
| Price guards           | A guarded pair with no price is closed and says so; fresh signed prices open it; a conversion on the guarded pair settles at the quoted fee                     |
| Custody and redemption | A mint inside attested headroom succeeds and one above it changes nothing; a reserve shortfall restricts the route; a redemption is escrowed and then fulfilled |

CI runs this same command on every pull request (`.github/workflows/ci.yml`).

### Path D: the API against the Testnet deployment (about 10 minutes)

Needs the contract accounts above, the quote-signer key for that deployment and a Testnet account on the allowlist. Full instructions: [`docs/local-setup.md`](docs/local-setup.md), step 4.

```bash
cp apps/api/.env.example apps/api/.env          # contract accounts, NEAR_RPC_URL, QUOTE_SIGNER_SECRET_KEY, ADMIN_API_KEY
cp apps/indexer/.env.example apps/indexer/.env
pnpm --filter @pontis/api start                 # http://localhost:3000
pnpm --filter @pontis/indexer start             # in a second terminal
```

1. `curl -s localhost:3000/v1/health | jq`. **See:** `ok`, a real `chainHeight`, and `indexerLagBlocks` of a few blocks.
2. `curl -s localhost:3000/v1/assets | jq '.items[] | {id, symbol, synthetic, verificationStatus}'`. **See:** the registered representations, read from the chain.
3. Request a quote:

   ```bash
   curl -s localhost:3000/v1/quotes -H 'content-type: application/json' \
     -d '{"fromId":"tgold-a","toId":"tgold-b","amountIn":"1000000","accountId":"<your allowlisted account>"}' | jq
   ```

   **See:** the ratio, `feeBps`, `amountOut`, an `expiresAt` 60 seconds ahead and a signature. An account that is not allowlisted gets `NOT_ELIGIBLE`.

4. Follow [`docs/demo-script.md`](docs/demo-script.md) to accept the quote, sign it and watch it settle. **See:** the state reach `SETTLED` with a `conversion_completed` event a few seconds after the transaction finalizes.

To point the web app at this API, set `VITE_API_MODE=live` in `apps/web/.env.local` ([`apps/web/README.md`](apps/web/README.md)).

### Path E: a live NEAR Intents quote (dry run, no deposit)

The 1Click API has no testnet, so this path reads its mainnet token list and requests one dry quote. It does not create a deposit address or submit a deposit. The unauthenticated request below uses the additional 0.25% fee described in [1Click authentication](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication).

1. In `apps/api/.env`, set `INTENTS_MODE=live`. `INTENTS_API_KEY` is optional. Start the API and open `/app/convert` with `VITE_API_MODE=live` in the web app.
2. Run `curl -s localhost:3000/v1/intents/tokens | jq '.simulated'`. **See:** `false`; the page fetches NEAR and Arbitrum USDC IDs from that live token list.
3. Request the quote through the API (the IDs and parameters below are the exact values used for the recorded quote):

   ```bash
   curl -s localhost:3000/v1/intents/quote -H 'content-type: application/json' \
     -d '{"swapType":"EXACT_INPUT","slippageTolerance":100,"originAsset":"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","destinationAsset":"nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near","amount":"10000000","depositType":"ORIGIN_CHAIN","recipient":"0xcd578f02bb4d8b12ebb0874bbfa08783d087f609","recipientType":"DESTINATION_CHAIN","refundTo":"wrap.near","refundType":"ORIGIN_CHAIN","deadline":"2026-11-12T15:07:22.460Z"}' | jq
   ```

   **See:** a real quote for 10 USDC on NEAR to USDC on Arbitrum. The convert page shows the input, estimated output, minimum output, route, `source` and `simulated` fields under “Live NEAR Intents quote (mainnet, dry run). No deposit is submitted. Pontis's synthetic tokens are not routable through Intents.”

   Trimmed response observed from the API route:

   ```json
   {
     "quoteId": "9b3c05f2-ae97-45e3-b65b-1e0cb2b83af0",
     "amountIn": "10000000",
     "amountOut": "9992749",
     "minAmountOut": "9892821",
     "deadline": "2026-11-12T15:07:22.460Z",
     "source": "near_intents_1click",
     "simulated": false,
     "confidentiality": "public"
   }
   ```

   The quote contains no deposit address. The identifier is 1Click's `correlationId`; the API maps it to `quoteId` because dry quotes do not receive a swap ID. Dry quote responses have no persistent explorer URL; the response above was captured from the API route at runtime.

### Path F: a NEAR Testnet account signs a Sepolia mint

This script-driven Chain Signatures demonstration uses the MPC signer at `v1.signer-prod.testnet`. It is independent of `pontis-core` and does not implement a bridge.

1. Open the [Sepolia `bridgeMint` transaction](https://sepolia.etherscan.io/tx/0x10ca45183afca9a266676b2f1342f126dbce60d6bb93d92c774acb0bd84d7c90). **See:** a successful mint sent by the derived NEAR-controlled address.
2. Open the matching [NEAR Testnet `sign` call](https://testnet.nearblocks.io/txns/4e621UTXZodn3y2KyuiGG2q5zdHNWPazRV7k5PMqS79G). **See:** the Testnet account's request to the MPC signer.
3. Open the [Sepolia token contract](https://sepolia.etherscan.io/address/0x84393560bc91a1c2edea435dfdb704ad17df0886). **See:** the token whose `bridge` authority is the derived address.

Recorded details: NEAR account `pontis.testnet`; token `0x84393560bc91a1c2edea435dfdb704ad17df0886`; derived address `0xCd578f02BB4d8b12EBB0874bBfa08783d087f609`; derivation path `pontis-sepolia-mint-v1`. The NEAR sign transaction is [`4e621UTXZodn3y2KyuiGG2q5zdHNWPazRV7k5PMqS79G`](https://testnet.nearblocks.io/txns/4e621UTXZodn3y2KyuiGG2q5zdHNWPazRV7k5PMqS79G); the resulting Sepolia transaction is [`0x10ca45183afca9a266676b2f1342f126dbce60d6bb93d92c774acb0bd84d7c90`](https://sepolia.etherscan.io/tx/0x10ca45183afca9a266676b2f1342f126dbce60d6bb93d92c774acb0bd84d7c90).

## What is real and what is simulated

| Area                                  | Status                                                                                                                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pontis-core` and the token contracts | **Real.** Deployed on NEAR Testnet                                                                                                                                                                                                                  |
| Parity conversion and refund          | **Real** on Testnet and the sandbox, with real signed transactions                                                                                                                                                                                  |
| On-chain signature checks             | **Real.** Quotes, prices and reserve attestations are verified by the contract                                                                                                                                                                      |
| API, indexer, reconciler              | **Real.** They read and follow the chain                                                                                                                                                                                                            |
| NEP-413 operator sign-in              | **Real.** Exercised end to end on the sandbox                                                                                                                                                                                                       |
| Assets, issuers, custodians           | **Fictional.** All run by the project; evidence is self-attested and labelled so                                                                                                                                                                    |
| Reserve attestations and prices       | **Simulated.** Signed with published development keys. The contract proves who signed, never that reserves exist                                                                                                                                    |
| Market data and charts                | **Simulated** by `apps/simulator` and flagged `simulated: true`                                                                                                                                                                                     |
| Vault liquidity                       | **Operator-funded.** One owner account funds the vault and holds every role                                                                                                                                                                         |
| Redemption                            | **Mechanism only.** Tokens are escrowed and burned; nothing is paid out                                                                                                                                                                             |
| NEAR Intents                          | **Live dry quote verified.** The API and convert-page panel can read the 1Click mainnet token list and request dry quotes with `simulated: false`; simulator remains default, no deposit is submitted, and Pontis synthetic assets are not routable |
| Chain Signatures                      | **Script-driven Testnet demonstration.** A NEAR Testnet account requested an MPC signature for a Sepolia mint sent by its derived address; it is not part of `pontis-core` and is not a bridge                                                      |
| Private RFQ matcher                   | **Local simulation.** The operator sees every order; nothing settles through the core contract                                                                                                                                                      |
| Lending (Morpho Blue adapter)         | **Config-gated.** Returns unsigned transactions only once a verified deployment is configured; see the address table above                                                                                                                          |
| EVM demo token                        | **Deployed on Sepolia for the Chain Signatures demonstration.** The derived address is the sole mint authority; no EVM relayer key exists. No route or bridge connects it to NEAR or `pontis-core`                                                  |
| Web app                               | **Mock mode by default**; live mode uses the API and a Testnet wallet                                                                                                                                                                               |

The complete lists are in [`docs/known-limitations.md`](docs/known-limitations.md) and [`docs/architecture/deliberately-mocked.md`](docs/architecture/deliberately-mocked.md).

## Architecture

```mermaid
flowchart LR
    user([Holder and wallet])
    web["apps/web<br/>React"]
    api["apps/api<br/>Fastify REST"]
    idx["apps/indexer<br/>indexer + reconciler"]
    db[("Postgres<br/>cache of the chain,<br/>quotes, audit")]
    core["pontis-core<br/>registry, compatibility, guards,<br/>custody, conversion, vault"]
    tokens["NEP-141 tokens<br/>one account per representation"]

    user --> web
    web -->|"quote, unsigned actions"| api
    user -->|"signs ft_transfer_call"| tokens
    tokens -->|"ft_on_transfer"| core
    core -->|"payout or refund"| tokens
    api -->|"views"| core
    api --> db
    idx -->|"final blocks, events"| core
    idx --> db
```

How one conversion settles:

```mermaid
sequenceDiagram
    participant W as Wallet
    participant A as API
    participant S as Token A
    participant C as pontis-core
    participant B as Token B
    participant I as Indexer
    W->>A: request quote
    A->>C: views: route, allowlist, inventory, guards
    A-->>W: signed quote (60 s) and unsigned actions
    W->>S: ft_transfer_call(core, amount, quote + signature)
    S->>C: ft_on_transfer
    Note over C: verify signature, expiry, versions,<br/>route, allowlist, reserves, price guard, nonce
    C->>B: ft_transfer(holder, amount out)
    C-->>S: keep the input, or return all of it if refused
    I->>C: read final block events
    I->>I: mark the quote SETTLED
```

Design rules that hold throughout:

- **The chain is the authority.** The route is checked when the API quotes and again inside the contract. The contract's answer wins.
- **The API never holds a user key.** It returns unsigned actions for the wallet to sign.
- **A refusal returns the whole input** and emits an event with the reason.
- **Integer math only.** Amounts are integer strings end to end; the contract and the API share test vectors in [`test-vectors/`](test-vectors).

More detail: [`docs/architecture/overview.md`](docs/architecture/overview.md), the 22 decision records in [`docs/decisions/`](docs/decisions/README.md) and the threat models in [`docs/threat-model/`](docs/threat-model).

## Where Pontis is weak

- **No real issuer, asset, user or liquidity.** Everything shown is a mechanism running on fictional data.
- **Equivalence needs a trusted reviewer.** The registry records a judgement; it does not prove a legal claim. Who reviews, and under what liability, is unsolved.
- **One operator holds every role.** There is no multisig or timelock. The vault is funded by hand and a busy direction drains it.
- **Issuers must opt in.** A conversion between restricted tokens needs both issuers to accept the other's holders. That is a business problem before it is a technical one.
- **The cheapest alternative is already cheap.** A holder who can mint and redeem directly with an issuer can sell and buy back for a redemption fee as low as 0.05%. Parity conversion has to beat that.
- **Same-chain only today.** The cross-chain leg is researched and partly scaffolded, not shipped.

[`docs/market-context.md`](docs/market-context.md) sections (c) and (d) set out what would have to be true for Pontis to matter.

## What comes next

1. One real issuer pair with a documented legal basis for equivalence, on Testnet, with the issuer running its own registrar account.
2. Multisig ownership and separated registrar, attester and approver roles.
3. Cross-chain settlement: NEAR Intents for supported routes, and Chain Signatures so a NEAR account that holds the policy can sign on the destination chain.
4. Third-party attesters for reserves and evidence, replacing the development keys.
5. Liquidity from more than one provider, with inventory rebalancing.

## Hackathon disclosures

Written to match the NEAR HACKATHON rules.

- **Built in the window.** The first commit is dated 7 November 2026. There is no code from before the announcement on 19 October 2026 and no earlier version of this product on another chain.
- **Tracks.** Unstoppable DeFi. This is one submission.
- **Other submissions by the same person.** `<FILL_IN: name and link of the other project, or "None">`.
- **Testnet.** The NEAR contracts run on Testnet. NEAR Intents has no testnet; its verified live quote was a dry read from the production API. No deposit was submitted.
- **AI-written code.** Much of this repository was written with AI coding agents (Claude Code `<FILL_IN: and any others, or delete this placeholder>`), directed and reviewed by the team.
- **Templates and earlier code.** No template, boilerplate repository or pre-hackathon library of our own was used. The third-party libraries are listed below.
- **Secrets.** No keys are committed. Every key is read from an environment variable; the `.env.example` files show the names.
- **License.** MIT, see [`LICENSE`](LICENSE).

### Third-party libraries

| Area                 | Libraries                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts (Rust)     | `near-sdk`, `near-contract-standards`, `near-workspaces` (tests), `cargo-near`, `wasm-opt` (binaryen)                                                    |
| Contracts (Solidity) | Foundry (`forge`, `anvil`)                                                                                                                               |
| NEAR clients         | `near-api-js`, `@near-wallet-selector/core`, `modal-ui`, `my-near-wallet`, `meteor-wallet`                                                               |
| API and indexer      | `fastify`, `@fastify/cors`, `@fastify/rate-limit`, `zod`, `@asteasolutions/zod-to-openapi`, `drizzle-orm`, `drizzle-kit`, `pg`, `tweetnacl`              |
| EVM and lending      | `viem`, `@morpho-org/morpho-sdk`                                                                                                                         |
| Web                  | `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `tailwindcss`, `vite`, `msw`, `lucide-react`, Geist and Instrument Serif (Fontsource) |
| Tooling and tests    | `typescript`, `tsx`, `vitest`, Testing Library, `jsdom`, `eslint`, `typescript-eslint`, `prettier`, `yaml`, `@apidevtools/swagger-parser`                |
| Infrastructure       | PostgreSQL 16 (Docker), FastNEAR public Testnet RPC                                                                                                      |

Exact versions are in each `package.json`, `Cargo.toml` and the lockfiles.

## Repository layout

```text
apps/api/            Fastify REST API: catalog, quotes, conversions, custody, lending, intents, auth
apps/indexer/        NEAR event indexer, reconciler and market jobs
apps/simulator/      Labelled fake prices, NAV, supply and trade flow for the demo
apps/web/            React web app
contracts/           Rust: pontis-core, synthetic-token (NEP-141), mock-payout-token, sandbox tests
contracts-evm/       Solidity (Foundry): permissioned bridge token and attestation verifier, local only
packages/            domain, api-types (OpenAPI), db, near-client, quote-engine, market-data,
                     intents-private, dev-keys
scripts/             deploy, seed, allowlist, guards, reserves and operator commands
tests/e2e/           script-driven end-to-end run on a sandbox or Testnet
test-vectors/        vectors shared by the contract and the TypeScript packages
docs/                architecture, decisions, research, threat models, runbooks, dossiers
```

## Development

Prerequisites: Node.js 22 or newer, pnpm (pinned by `packageManager`), Docker, the Rust toolchain in `rust-toolchain.toml`, and either `cargo-near` or `wasm-opt`. Foundry is optional and only needed for `contracts-evm/`.

```bash
pnpm install                    # install workspace dependencies
pnpm db:up                      # start local PostgreSQL 16; pnpm db:down to stop
pnpm format:check               # Prettier (pnpm format to fix)
pnpm -r lint                    # ESLint in every package
pnpm -r typecheck               # tsc in every package
pnpm -r test                    # unit tests in every package
pnpm rust:fmt                   # also rust:clippy and rust:test
pnpm build:contracts            # cargo-near build; scripts/build-contracts.sh slim for the smaller build
pnpm test:integration           # contract tests on a near-workspaces sandbox
pnpm --filter @pontis/e2e e2e   # the full system end to end
pnpm demo:seed                  # deploy and seed a populated demo catalogue (see docs/local-setup.md)
```

Deploying to Testnet: `scripts/deploy-testnet.sh slim` builds, creates the sub-accounts, deploys and seeds. Costs, account naming and every command are in [`docs/architecture/deployments.md`](docs/architecture/deployments.md).

Contributing: work lands through pull requests into `main`. Commit-size, message and branch rules are in [`BuildPlan.md`](BuildPlan.md) section 4; run `pnpm check:commit-size` before committing.

## Documentation

| Document                                                                           | Purpose                                                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`docs/market-context.md`](docs/market-context.md)                                 | The sourced market picture, competitors and where Pontis is weak        |
| [`docs/architecture/overview.md`](docs/architecture/overview.md)                   | Components, conversion flow, quote lifecycle, trust boundaries          |
| [`docs/local-setup.md`](docs/local-setup.md)                                       | Clean checkout to a running system, locally and on Testnet              |
| [`docs/demo-script.md`](docs/demo-script.md)                                       | A ten-minute walkthrough                                                |
| [`docs/architecture/deployments.md`](docs/architecture/deployments.md)             | How to deploy, and what it costs                                        |
| [`docs/architecture/deployment-record.md`](docs/architecture/deployment-record.md) | Deployed accounts and wasm hashes                                       |
| [`docs/decisions/`](docs/decisions/README.md)                                      | Architecture decision records 0001 to 0022                              |
| [`docs/threat-model/`](docs/threat-model)                                          | Threats and accepted limitations: MVP, bridge, confidential execution   |
| [`docs/known-limitations.md`](docs/known-limitations.md)                           | Everything the system does not do, or does in a simplified way          |
| [`docs/runbooks/`](docs/runbooks/README.md)                                        | Operator procedures: pause, vault, reserves, redemptions, auth          |
| [`docs/research/`](docs/research)                                                  | NEAR Intents, Chain Signatures, Confidential Intents, NEP-413, bridging |
| [`docs/morpho-sepolia-lending.md`](docs/morpho-sepolia-lending.md)                 | The lending module and its deployment checklist                         |
| [`docs/success-metrics.md`](docs/success-metrics.md)                               | How success is measured                                                 |
| [`ProjectBrief.md`](ProjectBrief.md), [`BuildPlan.md`](BuildPlan.md)               | Product brief and build plan                                            |

## License

MIT, see [`LICENSE`](LICENSE).
