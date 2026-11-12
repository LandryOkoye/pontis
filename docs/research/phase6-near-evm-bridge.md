# Phase 6 NEAR–EVM bridge research

- **Checked:** 2026-11-11
- **Scope:** official Chain Signatures, NEAR bridge/Omni Bridge, and Foundry local EVM references
- **Use:** informs the Phase 6 synthetic testnet and local-Anvil implementation; not a security review

## Chain Signatures

The current NEAR documentation describes Chain Signatures as allowing NEAR accounts, including
smart contracts, to sign transactions on other chains. Its documented flow is: derive a foreign
address, construct an unsigned transaction, request an MPC signature, format the signed transaction,
and relay it to the destination. The EVM example uses ECDSA and the EVM adapter. The docs list MPC
contract IDs on both networks: `v1.signer` on mainnet and `v1.signer-prod.testnet` on testnet.
This confirms a testnet MPC contract exists, but does not by itself establish that a Pontis-specific
bridge transaction is integrated or tested. [NEAR: Signing Transactions](https://docs.near.org/chain-abstraction/chain-signatures/implementation)

The same documentation describes the derived destination address as deterministic for a NEAR
account and derivation path. A signature alone does not broadcast the EVM transaction; a relayer
must submit the signed bytes. The bridge implementation must bind its derivation path, EVM chain ID,
token address, route, nonce and transaction payload to the authorization it requests.

## Bridge and Omni Bridge availability

NEAR's official Intents bridging product page currently describes supported-asset transfers and
Omni Bridge receiving an asset before a wrapped asset is issued on the destination chain. The page
describes a product/service surface, not a public arbitrary-token verifier contract or a procedure
for registering Pontis synthetic assets. [NEAR Intents: Bridging](https://intents.near.org/use-cases/bridging)

NEAR's chain-abstraction page describes Omni Bridge in broad terms as an automated cross-chain
transfer mechanism. It does not supply a protocol contract interface, contract address, or
asset-onboarding process for a custom permissioned test asset. [NEAR: Chain Abstraction](https://www.near.org/chain-abstraction)

**Conclusion:** no directly usable official Omni Bridge contract/API for Pontis custom permissioned
assets was verified in this research. Phase 6 therefore uses a Pontis-owned bridge state machine
and a local Anvil destination authority first. Chain Signatures remain an adapter target that must
be tested against the official testnet signer before being called integrated.

## Local EVM testing

Foundry documents Anvil as a local Ethereum node for development and testing. Forge provides
contract compilation and test execution, making the local contract tests reproducible without a
public EVM RPC or faucet. [Foundry: Anvil](https://www.getfoundry.sh/anvil/index.html),
[Foundry: Forge](https://www.getfoundry.sh/forge/index.html)

## Not verified in this pass

- Current public EVM testnet faucet/RPC reliability or a preferred testnet for the demo.
- Any deployed Pontis bridge, wrapped token, or custom-asset route.
- A Chain Signatures adapter transaction executed end-to-end on NEAR testnet.

Do not claim any of these as supported until verified with current official documentation and a
test transaction. The local implementation is synthetic and simulated.
