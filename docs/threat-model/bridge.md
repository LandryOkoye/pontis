# Bridge threat model (Phase 6 foundation)

- **Status:** Draft; covers only the local synthetic EVM token and shared state model
- **Date:** 2026-11-11
- **Scope:** local Anvil and synthetic test assets. No live bridge or real funds.
- **Related:** [ADR 0021](../decisions/0021-evm-bridge-foundation.md), [MVP threat model](mvp.md)

This document records the threats the foundation addresses and the unresolved bridge threats. It
does not certify a bridge design or authorize testnet asset movement.

| Threat                                     | Current control                                                                                 | Remaining risk / work                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthorized destination mint              | `bridgeMint` is restricted to the configured bridge address; cap is checked.                    | Current code has no message verifier or multisig/Chain Signatures authority. A compromised bridge key can mint up to the cap.                                                         |
| Ineligible destination recipient           | Issuer allowlist is checked on direct transfers and mint recipients.                            | Policy is an operator-managed boolean map; no signed credential, jurisdiction, investor-class or account-control proof. Revoking an account can leave its balance unable to transfer. |
| Issuer or protocol needs to stop transfers | Independent issuer and protocol pause flags block transfer, mint and bridge-out.                | No on-chain circuit breaker or pause race handling across both chains.                                                                                                                |
| Supply inflation across chains             | Domain model exposes source locked/burned and destination minted supply with a tolerance check. | No production monitor, authenticated source data, automatic route pause, or contract-enforced cross-chain supply invariant.                                                           |
| Replay of EVM bridge-out event             | EVM emits an incrementing per-token nonce.                                                      | No NEAR verifier consumes this nonce yet. The eventual proof domain must bind chain ID, token, route, amount, recipient and nonce.                                                    |
| EVM reorganization or false finality       | None in the token foundation.                                                                   | Relayer must wait configured confirmations, handle reorgs and only attest finalized receipts.                                                                                         |
| Relayer censorship or outage               | None in the token foundation.                                                                   | Retry/idempotency, monitoring, recovery, and deterministic refund/reconciliation paths remain unimplemented.                                                                          |
| Attester or MPC compromise                 | No external signing authority is connected.                                                     | The selected Chain Signatures/attester trust model and key rotation process require implementation and review.                                                                        |
| Destination failure after source lock/burn | Domain state model includes `DEST_FAILED`, `REFUND_PENDING`, `REFUNDED`, and reconciliation.    | No cross-chain escrow, callback or refund contract exists. A real state machine must not strand user assets.                                                                          |
| Misleading demo claims                     | Docs and token names label all assets synthetic and local.                                      | Any API/event/UI integration must carry source and simulated labels through to the user.                                                                                              |

The required live-demo safeguards remain the full route state machine, end-to-end Anvil round trip,
reorg tests, one-time inbound consumption, eligibility on both chains, supply monitoring and
recovery tests. Until those are shipped and reviewed, the implementation is a token fixture only.
