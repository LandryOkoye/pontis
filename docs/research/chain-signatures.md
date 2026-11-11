# Research: NEAR Chain Signatures

- **Status:** NOT YET VERIFIED. Nothing below is a finding. This file lists what must be read and recorded before any Chain Signatures code is written (phase 6, [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md) section 3).
- **Used by:** the bridge's `DestinationAuthority` and the `CrossChainSigner` adapter (`deriveAddress`, `requestSignature`).
- **Last verified:** never.

## Questions to answer from the current official documentation

Record each answer with the URL and the date it was read. Mark anything that could not be confirmed `UNVERIFIED`.

| #   | Question                                                                                                                                         | Answer | Source URL | Date read |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- | --------- |
| 1   | Which NEAR network has the MPC signer contract (testnet, mainnet), and what is its account ID on each?                                           |        |            |           |
| 2   | Which curves are supported (secp256k1, Ed25519) and which key versions or domains select them?                                                   |        |            |           |
| 3   | What is the exact `sign` call: method name, argument shape, payload size and encoding, derivation path field?                                    |        |            |           |
| 4   | Required attached deposit and gas, and what happens to the deposit on failure?                                                                   |        |            |           |
| 5   | How is the response delivered and parsed (signature encoding, recovery id), and what are the error shapes?                                       |        |            |           |
| 6   | How is a destination address derived from (predecessor account, path, key version)? Is there a documented algorithm and a reference test vector? |        |            |           |
| 7   | Which destination chains are documented and tested, and is the target EVM testnet among them?                                                    |        |            |           |
| 8   | Latency and rate limits for signature requests; behaviour when the contract is busy.                                                             |        |            |           |
| 9   | Who can call `sign` for a derived path (is the predecessor the only authority)?                                                                  |        |            |           |
| 10  | The trust model: size and selection of the MPC node set, what a node collusion could do.                                                         |        |            |           |

## Design consequences to record once answered

- Derivation path scheme: one path per route or asset, so a compromise is scoped.
- Whether the sandbox can run the MPC contract. If not, tests use `LocalDevSigner` and one testnet-only test (skipped in CI by default) calls the real contract.
- Address-derivation test vectors, computed in TypeScript and, if the contract derives addresses, in Rust, and compared.

## What is real and what is simulated

To be filled in when the adapter exists. Until then nothing in this repository uses Chain Signatures.
