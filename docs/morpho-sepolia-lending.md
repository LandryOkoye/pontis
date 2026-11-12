# Morpho Blue Sepolia lending

The lending module is a provider-neutral Pontis layer. Pontis decides whether a token is acceptable collateral and calculates a conservative capacity; Morpho Blue holds the lending position and the loan-token liquidity comes from lenders who supplied that market.

The initial EVM adapter targets Ethereum Sepolia and uses Morpho's official ABI package through `@morpho-org/morpho-sdk`. It calls the Morpho Blue core directly for a controlled test deployment because the high-level SDK resolves Blue Bundles through its maintained chain-address registry. Pontis therefore never substitutes a guessed testnet periphery address.

## Required deployment configuration

Do not enable a market by pasting addresses from an explorer or a blog post. The deployer must record the deployment transaction, source/bytecode verification, owner, token decimals, and test results in the environment-controlled market registry.

1. Deploy or identify a Morpho Blue core contract on Sepolia and configure `MORPHO_BLUE_ADDRESS`.
2. Deploy mock ERC-20 `NVDA` and `TSLA` collateral tokens and mock USDC/USDT. Register each contract, issuer authorization, ERC-20 decimals, allowed chain, provider compatibility, and Pontis policy in the collateral registry.
3. Deploy a controlled Morpho-compatible oracle for each collateral/loan pair. Pontis must consume a price feed that includes an observed timestamp and confidence assessment; a bare `price()` read is not sufficient for Pontis authorization.
4. Deploy a governance-approved IRM and create a separate Morpho market for every permitted pair, such as `NVDA/USDC`, `TSLA/USDC`, and `NVDA/USDT`. Store the exact five immutable parameters: loan token, collateral token, oracle, IRM, and LLTV.
5. Fund each market from the designated liquidity-provider wallet by supplying the mock stablecoin. Morpho is protocol infrastructure; it is not the lender.
6. Configure a Sepolia RPC URL and market JSON. At startup, verify chain ID, then verify code at the Morpho core, collateral, loan token, oracle, and IRM addresses before exposing the market.

`MORPHO_BLUE_MARKETS_JSON` has this shape (addresses shown here are placeholders and must never be deployed as-is):

```json
[
  {
    "id": "nvda-usdc-sepolia",
    "collateralAssetId": "mock-nvda-sepolia",
    "collateralToken": "0x...",
    "loanToken": "0x...",
    "loanSymbol": "USDC",
    "oracle": "0x...",
    "irm": "0x...",
    "lltvWad": "500000000000000000"
  }
]
```

## User flow

1. Call `GET /v1/lending/collateral-assets` and discover wallet assets.
2. Call `POST /v1/lending/eligibility`; only an issuer-authorized, verified token with a fresh, verified, sufficiently confident price can proceed.
3. Read the market and `GET /v1/lending/markets/{id}/capacity?owner=...`.
4. Request `POST /v1/lending/deposits`. The response contains an ERC-20 approval and `supplyCollateral` call; the user's wallet signs and sends them.
5. Wait for the collateral transaction to confirm, then request `POST /v1/lending/borrows`. The adapter simulates `borrow` and returns an unsigned call only after capacity and market-liquidity checks pass.
6. Refresh the position after confirmation. Repayment returns a loan-token approval plus `repay`; withdrawal simulates `withdrawCollateral` before returning its call.

Pontis never accepts a private key, broadcasts a user transaction, or marks a plan successful. A production rollout must persist idempotency records and confirmations from the EVM receipt/event indexer before it reports a lending transaction as confirmed.

## Rhea isolation

`RheaLendingProvider` is a separate NEAR adapter seam. A Rhea-discovered NEP-141 asset can be eligible only for the Rhea provider and NEAR policy. It is not an ERC-20 and cannot be routed into a Morpho market unless a separately verified EVM representation, bridge/backing evidence, issuer authorization, and a dedicated policy are registered.

## Security checks

- Contract code is checked for each configured Morpho market dependency.
- Price age, verification, and confidence are mandatory preconditions for deposit/borrow authorization.
- Capacity uses the lower of Pontis policy LTV and market LLTV, then subtracts live debt and caps by lender-provided market liquidity.
- Calculations use integer units and rationals, never floating point.
- Borrow, repay, and withdrawal plans are simulated where a standalone call can be simulated. A wallet must re-simulate the ordered approval + action sequence immediately before submission because approval state is transaction-order dependent.
- Debt is conservatively derived from Morpho borrow shares; fresh on-chain simulation remains the authorization point.

## Demonstration acceptance checklist

Run this only after the deployment prerequisites above are complete:

1. Mint mock NVDA to a borrower and mock USDC to the liquidity provider.
2. LP supplies USDC to `NVDA/USDC`; record its market liquidity.
3. Borrower deposits NVDA, waits for confirmation, and borrows less than the displayed capacity.
4. Confirm the position reports collateral, debt, current LTV, health factor, and reduced available liquidity.
5. Repay the full debt (prefer Morpho's share-based full-close path in the production wallet flow), wait for confirmation, then withdraw all collateral.
6. Repeat with a stale controlled-oracle timestamp, an unverified token, and no LP liquidity. Pontis must return no executable borrow plan in all three cases.
