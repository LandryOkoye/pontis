# Research: Confidential Intents and private execution

- **Status:** NOT YET VERIFIED. Nothing below is a finding. This file lists what must be read and recorded before any private-execution integration is written (phase 8, [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md) section 3).
- **Used by:** an optional `ConfidentialIntentsClient` behind an adapter. Pontis's own operator-trusted private RFQ is built regardless and does not depend on this research.
- **Last verified:** never.

## Questions to answer from the current official documentation

Record each answer with the URL and the date it was read. Mark anything that could not be confirmed `UNVERIFIED`.

| #   | Question                                                                                                        | Answer | Source URL | Date read |
| --- | --------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------- |
| 1   | What does the product offer today, and what exactly is hidden (amounts, parties, timing, order book)?           |        |            |           |
| 2   | Is it available on a testnet, or only on mainnet or behind an access programme?                                 |        |            |           |
| 3   | How is it accessed (API, SDK, contract calls), and with what authentication?                                    |        |            |           |
| 4   | What is the trust model (for example trusted hardware, permissioned operators), and what can the operators see? |        |            |           |
| 5   | Does it support selective disclosure to an auditor, and how?                                                    |        |            |           |
| 6   | Can restricted or permissioned assets be used, and where is eligibility enforced?                               |        |            |           |

## Decisions that do not wait for this research

- A NEAR contract cannot hide amounts on a public ledger. Pontis offers tiered privacy and states the trust model of each tier. The private RFQ's matcher can see every order and its API responses carry `confidentiality_level: "operator_trusted"`.
- Token transfers still show amounts, timing and addresses on chain. The documentation of the feature lists exactly what leaks and which mitigations are implemented (`docs/threat-model/confidential.md`, written with the feature).
- TEE attestation verification is implemented only if its exact verified claims can be specified. It is not faked.

## What is real and what is simulated

To be filled in when the feature exists. Until then nothing in this repository offers private execution.
