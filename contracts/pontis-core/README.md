# pontis-core

The Pontis protocol contract (one contract, internal modules; [ADR 0002](../../docs/decisions/0002-contract-layout-and-events.md)). Testnet and synthetic assets only.

This crate currently holds the **registry** (B5). Compatibility and policy (B6) and conversion and vault (B7) are added by later PRs.

## Roles ([ADR 0003](../../docs/decisions/0003-admin-roles-and-pause.md))

| Role              | Methods                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `owner`           | `grant_role`, `revoke_role`, `transfer_ownership` and `accept_ownership` (two-step), `unpause`, `unpause_asset`                                                          |
| `registrar`       | `register_issuer`, `register_canonical_asset`, `register_representation`, `add_evidence`, `set_issuer_status`, `set_canonical_asset_status`, `set_representation_status` |
| `pauser`          | `pause` (global), `pause_asset`. Can never unpause                                                                                                                       |
| `compat_approver` | held now, used from B6                                                                                                                                                   |

The owner holds no other role implicitly; grant roles explicitly. Every state-changing method requires exactly 1 yoctoNEAR and emits an event. While the contract is globally paused, registrar methods fail; owner role management, `unpause` and pausing still work.

## Records

Issuers, canonical assets and token representations are separate records ([brief §6.1](../../ProjectBrief.md)). Each carries `synthetic`, `verification_status`, `status` and evidence references (URI, sha256, provenance, timestamp, adder).

- New records are `restricted`. A registrar can move `restricted` to `active`, `rejected` or `deprecated`, and `active` to `restricted` or `deprecated`. `rejected` and `deprecated` are final. `paused` is entered by a pauser and left only by the owner.
- **Activation requires a complete record** (brief §19.1): required text fields non-blank, at least one evidence reference, a `verification_status` backed by the evidence's provenance, and for a representation an `active` issuer and canonical asset.
- Representation `unit_multiplier` is reduced to lowest terms; decimals and multiplier are immutable. There are no update methods: reject or deprecate and register a new record.
- A representation's token `account_id` is unique, and `get_representation_by_account` resolves it.
- `is_representation_executable(id)` is true only when the contract is unpaused and the representation, issuer and canonical asset are all `active`. B6 adds compatibility to this check.

IDs are lowercase `a-z0-9-`, 2 to 64 characters. List views take `from_index` and `limit` (default 50, max 100).

## Events

`EVENT_JSON:{"standard":"pontis","version":"1.0.0","event":"<name>","data":{...}}`. This PR emits `role_granted`, `role_revoked`, `ownership_transfer_proposed`, `ownership_transferred`, `paused`, `unpaused`, `issuer_registered`, `issuer_status_changed`, `canonical_asset_registered`, `canonical_asset_status_changed`, `representation_registered`, `representation_status_changed` and `evidence_added`.

## Commands

```bash
cargo test -p pontis-core
```
