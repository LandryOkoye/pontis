# Roles and signer keys

Who may act is a role; who may sign an attestation is a registered key ([ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md) section 2). Only the owner grants roles and registers keys. Every call needs 1 yoctoNEAR.

## Give an account an attester role and a key

```bash
near call $CORE grant_role '{"role":"reserve_attester","account_id":"custodian.testnet"}' --accountId $OWNER --depositYocto 1
near call $CORE add_signer_key '{"role":"reserve_attester","account_id":"custodian.testnet","public_key":"ed25519:...","scopes":["reserves"]}' --accountId $OWNER --depositYocto 1
near view $CORE get_signer_keys '{"role":"reserve_attester"}'
```

Allowed scopes: `reserve_attester` takes `reserves` and `custody`, `bridge_attester` takes `bridge`, `attester` takes `kyb`, `legal`, `custody` and `audit`. A role holds at most 8 keys; a key may be registered once per role.

## Refusals you will meet

| Message                                      | Meaning                               | Do                                                                     |
| -------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `a registrar cannot hold an attester role`   | The account is a registrar            | Use a different account; do not revoke the registrar role to get round |
| `an attester cannot hold the registrar role` | The account holds an attester role    | Same                                                                   |
| `the owner cannot hold an attester role`     | The owner is the target               | Use a separate attester account                                        |
| `scope is not allowed for this role`         | The scope does not belong to the role | Check the list above                                                   |
| `account does not hold this role`            | The key's account has no such role    | Grant the role first                                                   |

## Rotate or remove a key

Register the new key first (a role may hold several), switch the signer, then `remove_signer_key`. Revoking the role removes every key of that account for the role in the same call and emits one `signer_key_removed` per key. A removed key stops new submissions at once; attestations already stored stay until a newer one replaces them.

## Read what an account may do

`near view $CORE get_account_roles '{"account_id":"..."}'` lists snake_case role names, `owner` first. The API reads it at sign-in.
