# pontis-core

The Pontis protocol contract (one contract, internal modules; [ADR 0002](../../docs/decisions/0002-contract-layout-and-events.md)). Testnet and synthetic assets only.

This crate holds the **registry** (B5) and **compatibility, policy and route gate** (B6), and **conversion and vault** (B7).

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

## Compatibility, policy and route ([ADR 0004](../../docs/decisions/0004-compatibility-and-policy-versioning.md))

- **Relationships** are keyed `"{a}:{b}"` with `a < b`; `ratio` is stored in the `a` to `b` direction (the contract sorts the pair and inverts the ratio when needed). Lifecycle: `propose_compatibility`, `approve_compatibility`, `reject_compatibility`, `suspend_compatibility` (approver or pauser, works during a global pause); suspended pairs return through re-approval. Evidence goes through `add_compatibility_evidence`.
- **`version`** equals the length of the append-only history and moves on every recorded change. Approving `DIRECT_EQUIVALENT` needs evidence, two active representations and a ratio equal to `multiplier_a / multiplier_b`.
- **Policy:** `set_allowlist_required` (rule; bumps the global `policy_version`, default required) and `set_allowlist` (membership; does not bump it), both registrar-only.
- **`get_route(from, to)`** returns `executable` plus `RouteTerms` (ratio in that direction, `compatibility_version`, `policy_version`) or a `RouteRefusal`. Only an approved `DIRECT_EQUIVALENT` pair between active, unpaused representations is executable.

## Conversion and vault ([ADR 0006](../../docs/decisions/0006-quote-signing-model.md), [0007](../../docs/decisions/0007-conversion-via-ft-transfer-call.md), [0008](../../docs/decisions/0008-vault-inventory-and-funding.md))

- **Funding:** the owner calls `ft_transfer_call` on a token with `msg = "fund_vault"`. Anyone else is refunded. `withdraw_inventory` (owner) debits first, can take only spendable inventory (never a pending input or a reserved output) and restores on a failed payout. `get_inventory(id)` is the spendable balance; `get_pending_inbound(id)` is what in-flight conversions hold; `get_pending_conversion(nonce)` reads one pending record.
- **Config:** `set_quote_signer` (ed25519 only, replaces the previous key at once) and `set_fee_bps` (default 10, cap 100), both owner-only.
- **Conversion:** the user calls `ft_transfer_call` on the source token with `msg = {"quote": {...}, "signature": "<base64>"}`. `ft_on_transfer` runs every check against live state and, on any failure, returns the whole input and emits `conversion_rejected` with a `reason`. On success it marks the nonce used, reserves the output (taken out of inventory) and holds the input as **pending** (`get_pending_inbound`, not spendable), then pays out with `ft_transfer`. `on_payout_resolved(nonce)` runs once per pending conversion: on success the input becomes inventory and `conversion_completed` is emitted; on failure the reserved output returns to inventory, the input is _not_ counted (the token's resolver refunds it), `conversion_failed` is emitted and the input is returned as unused. A callback with no pending record aborts. A failed conversion needs a new quote: the nonce stays used. This is callback-based settlement with a compensating refund, not an atomic transaction.
- **Signed bytes:** `b"pontis-quote-v1" ++ borsh(payload)`, pinned by `test-vectors/quote-signing.json`. Amount math is pinned by `test-vectors/quote-math.json` and property tests.
- **Gas:** `GAS_FT_TRANSFER` (10 Tgas) and `GAS_CALLBACK` (15 Tgas) are reserved for the payout and its callback; the sandbox burns about 1 and 2 Tgas. A whole conversion completes with 40 Tgas prepaid (`contracts/integration-tests/tests/gas.rs`).

## Events

`EVENT_JSON:{"standard":"pontis","version":"1.0.0","event":"<name>","data":{...}}`. It emits `role_granted`, `role_revoked`, `ownership_transfer_proposed`, `ownership_transferred`, `paused`, `unpaused`, `issuer_registered`, `issuer_status_changed`, `canonical_asset_registered`, `canonical_asset_status_changed`, `representation_registered`, `representation_status_changed`, `evidence_added`, `compatibility_proposed`, `compatibility_approved` (flags re-approval), `compatibility_rejected`, `compatibility_suspended`, `policy_updated`, `allowlist_updated`, `quote_signer_set`, `fee_updated`, `vault_funded`, `vault_withdrawn`, `conversion_completed`, `conversion_failed` and `conversion_rejected`.

## Commands

```bash
cargo test -p pontis-core
```
