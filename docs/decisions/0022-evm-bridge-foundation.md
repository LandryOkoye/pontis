# ADR 0022: EVM permissioned token foundation

- **Status:** Proposed
- **Date:** 2026-11-11
- **Brief items:** expansion brief §8.1–8.2 (Workstream F)
- **Related:** [0014 scope expansion](0014-scope-expansion-beyond-mvp.md)

## Context

The Phase 6 bridge needs a destination representation which does not behave like an unrestricted
ERC-20. Its mint authority must be limited to the bridge, issuers must control recipient eligibility
and supply caps, and protocol and issuer operators must be able to pause independently. Phase 3
issuer attestation and the complete NEAR bridge state machine are separate dependencies.

## Decision

Add `contracts-evm/` as an optional Foundry project for the local Anvil demo. Its
`PermissionedBridgeToken` is explicitly synthetic-test-only and implements the minimal ERC-20
surface required by the tests, with issuer-managed eligibility, bridge-only mint, issuer cap,
independent protocol/issuer pause, and a burn-and-event `bridgeOut` carrying a monotonic nonce and
NEAR recipient string.

The repository does not assert that this token is wired to a live bridge or that `bridgeOut` is
proof of finality. A later relayer/NEAR verifier must check EVM chain ID, contract, route, nonce,
recipient eligibility, amount and configured confirmations, and ensure an inbound operation can be
consumed once. Integration with Chain Signatures follows the documented derive, construct, sign,
format and relay steps. Current official research and the unavailable custom-asset Omni Bridge
surface are recorded in [`docs/research/phase6-near-evm-bridge.md`](../research/phase6-near-evm-bridge.md).

For the local fallback path, `BridgeAttestationVerifier` checks M-of-N ECDSA attestations with a
domain-separated payload bound to the destination chain, verifier and token contracts, route,
source chain/bridge, operation ID, recipient, amount and expiry. It rejects duplicate signers and
marks each operation ID consumed before minting. This is an explicit attester trust model; these
signatures do not prove source finality and cannot be represented as a trustless bridge.

## Consequences

- Local tests can exercise EVM transfer permissioning, caps, pause and burn events without external
  network dependencies.
- This is only the destination-token foundation. It does not satisfy Phase 6's NEAR state machine,
  relayer, supply monitor, refund/reconciliation paths, or bridge round-trip definition of done.
- Testnet integration remains unverified and no live destination addresses or routes are claimed.
