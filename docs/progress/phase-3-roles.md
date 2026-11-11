# Phase 3 report: role registry and signer keys (contract)

Implements [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md) section 2 in `contracts/pontis-core`. Wallet sign-in (section 2, NEP-413) is the API's part of phase 3 and is reported separately. Issuer onboarding was cut by the same ADR; nothing here authenticates an issuer.

## What shipped

| Piece                                                                                                                                         | Real, testnet or simulated                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `RoleName` gains `attester`, `reserve_attester`, `bridge_attester` (appended), granted with the existing `grant_role` and `revoke_role`       | Real on-chain logic                                                                    |
| Separation: `registrar` and an attester role are never held together; the owner holds no attester role; an attester cannot be nominated owner | Real on-chain logic                                                                    |
| Signer key registry: `add_signer_key(role, account_id, public_key, scopes)`, `remove_signer_key`, `get_signer_keys`                           | Real on-chain logic. The only keys in the demo are dev keys derived from public labels |
| `verify_signer(role, key, scope, message, signature)`, the helper later modules verify through (reserves use it in phase 4)                   | Real ed25519 verification (`env::ed25519_verify`)                                      |
| Revoking an attester role drops that account's keys of the role in the same call                                                              | Real on-chain logic                                                                    |
| `get_account_roles(account_id)`: snake_case names, `owner` first. The API reads it at sign-in                                                 | Real read                                                                              |
| Events `signer_key_added`, `signer_key_removed` (plus the existing `role_granted`, `role_revoked`)                                            | Real                                                                                   |

## Verification

- `cargo test -p pontis-core`: the new unit tests cover the separation rules in both grant orders, the owner rule, the key registry (role, scope, curve, duplicate and cap checks, owner-only), `verify_signer` for each failure, and key removal on revoke.
- Sandbox (`contracts/integration-tests/tests/roles.rs`): a registrar cannot be granted an attester role, the owner is listed first and cannot be an attester, a key is refused for a scope outside the role and for a non-owner, and revoking the role removes the key. A refusal is a wasm trap in the sandbox, so those tests assert state.

## Open risks

- **The owner registers every key.** One owner account decides which keys count as a custodian or attester. That is a single point of trust until the multisig owner of phase 7. The separation rules stop one account holding both the registering and the signing role; they cannot stop the owner from registering a key it controls.
- **Separation is per account.** One operator with two accounts passes every rule here. Nothing on chain links accounts to people.
- **A key outlives nothing, but a signature outlives its key.** Removing a key stops new submissions. An attestation already stored stays until replaced.
- **Intermediate commits of this branch may not build every target.** Modules were added before the commits that wire them in; the branch head builds and passes.
