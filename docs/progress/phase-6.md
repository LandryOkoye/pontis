# Phase 6 progress: cross-chain bridge foundation

- **Status:** In progress; this report covers the first local EVM and state-model slice.
- **Date:** 2026-11-11

## Shipped in this slice

- `contracts-evm/PermissionedBridgeToken`: synthetic-test ERC-20-like token with bridge-only mint,
  issuer eligibility and cap, independent issuer/protocol pauses, and burn plus monotonic nonce on
  bridge-out.
- Shared TypeScript transfer state machine for lock-and-mint and burn-and-mint flows, explicit
  failure/refund/reconciliation outcomes, and a supply-delta tolerance helper.
- Foundry CI job and local Anvil/Foundry documentation.
- Official-source research and a bridge threat-model draft.

## Verification

- `forge test --root contracts-evm`: 5 passed.
- `pnpm --filter @pontis/domain test`: 56 passed.
- Domain typecheck and lint passed.
- `forge fmt --check contracts-evm/src contracts-evm/test` and `git diff --check` passed.

## What is real vs simulated

- EVM permissioning and bridge mint/burn behavior execute in the local Foundry EVM.
- The token, accounts and asset are synthetic. `bridgeOut` emits a relayer input but does not prove
  finality or cause a NEAR-side action.
- NEAR Chain Signatures documentation lists a testnet MPC contract and describes EVM signing, but
  Pontis has not executed an end-to-end signing/relay transaction.
- No custom-asset Omni Bridge contract interface or onboarding process was verified; no such
  integration is claimed.

## Open work and risks

- Implement NEAR source lock/burn and one-time inbound verification, plus corresponding events.
- Build idempotent relayer and configured EVM finality/reorg handling.
- Add route caps, pauses, eligibility synchronization and supply invariant monitoring.
- Implement deterministic refunds and reconciliation for every post-source failure.
- Run a local Anvil round trip and end-to-end API/indexer scenario.
- Verify a public EVM testnet RPC/faucet and Chain Signatures testnet transaction before selecting
  the live demo network.
