# Chain Signatures research for Phase 8

- **Checked:** 2026-11-12
- **Scope:** Phase 8 uses the Phase 6 EVM fallback work; this note re-verifies official Chain
  Signatures facts relevant to the skip over Phase 7.

## Verified

NEAR's official documentation lists the MPC contract as `v1.signer` on mainnet and
`v1.signer-prod.testnet` on testnet. The documented EVM transaction flow derives a foreign
address, constructs the unsigned transaction, asks the MPC contract to sign its payload, formats
the signature into the transaction, and broadcasts it through an EVM adapter. The EVM signing key
type is ECDSA. [NEAR: Signing Transactions](https://docs.near.org/chain-abstraction/chain-signatures/implementation)

The testnet MPC contract is an available service surface; the current Pontis repo still has no
Chain Signatures client or live integration smoke test. Phase 6's local M-of-N verifier remains a
simulated fallback, not Chain Signatures.

## Not claimed

- No Pontis signing transaction has been executed against the testnet MPC contract.
- A testnet MPC signer does not imply that Pontis's chosen EVM testnet, contract, gas policy or
  transaction format has been validated.
- The local fallback signatures do not prove source-chain events or replace source finality proofs.
