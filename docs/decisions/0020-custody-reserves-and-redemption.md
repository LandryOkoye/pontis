# ADR 0020: Custody registry, proof of reserve, gated mint and redemption

- **Status:** Accepted
- **Date:** 2026-11-11
- **Brief items:** expansion brief §6 (Workstream D, §6.1 to §6.5), §14 phase 4, §0.6 honesty labelling
- **Related:** [0003](0003-admin-roles-and-pause.md), [0007](0007-conversion-via-ft-transfer-call.md), [0008](0008-vault-inventory-and-funding.md), [0009](0009-synthetic-evidence-labelling.md), [0014](0014-scope-expansion-beyond-mvp.md), [0016](0016-price-reference-and-route-guards.md), [0019](0019-phase-3-scope-and-demo-issuers.md)

## Context

Nothing in the protocol is backed and nothing is redeemable. Phase 4 builds the machinery that **models** backing and redemption honestly: custodian records, signed reserve attestations enforced against supply, a mint that cannot exceed attested reserves, and a redemption lifecycle with escrow. In the demo the custodian and the issuer back-office are simulators holding test keys; the cryptography, the state machines and the invariants are real contract logic. Nothing is custodied, backed, audited or regulated, every figure is `simulated`, and the contract keeps refusing `independently_verified` ([0009](0009-synthetic-evidence-labelling.md)).

This ADR fixes method names, JSON shapes, events, storage, signed layouts and the invariants. The TypeScript work (API, indexer, simulator) is written from it. The contract adds one module family to `pontis-core` (`custody`, `reserve`, `mint_gate`, `redemption`, plus the role registry of [0019](0019-phase-3-scope-and-demo-issuers.md) section 2) and one change to `synthetic-token` (a minter).

## Decision

### 0. Conventions

All state-changing methods require exactly 1 yoctoNEAR, check role and pause state, emit a NEP-297 event (`standard: "pontis"`, `version: "1.0.0"`), use integer math and checked arithmetic, and keep new state in **side maps keyed by id**; no existing struct changes. New enum variants are appended. `U128` and `U64`-sized amounts are decimal strings in JSON; `u64` times are JSON numbers (ms since epoch). A panic is an unsuccessful transaction; a refusal inside `ft_on_transfer` returns the whole amount and emits an event. `simulated` and `source` (at most 64 bytes) are stored and echoed wherever a figure came from a signer; the contract never acts on `simulated`.

**Paging.** Every paged view takes `from_index: u64, limit: u64` (limit 1 to 100, 0 means 50) and returns `{items, total}`, newest last, so the API can mirror it.

**Pause.** The global pause or a `Paused` representation blocks: `submit_reserve_attestation`, `request_mint`, `execute_mint`, a new redemption (refused in `ft_on_transfer`), `accept_redemption`, `fulfil_redemption` and every setter. It does **not** block exits and safety actions: `reject_redemption`, `expire_redemption`, `reclaim_redemption`, `refresh_supply`, `evaluate_reserve` and all callbacks. A user can always get an escrow back.

### 1. Role registry (built first, [0019](0019-phase-3-scope-and-demo-issuers.md) section 2)

`RoleName` gains `attester`, `reserve_attester`, `bridge_attester` (appended; their snake_case JSON names are the variant names). Beyond the grant rules of 0019:

- `add_signer_key(role, account_id, public_key, scopes: Vec<String>)` and `remove_signer_key(role, public_key)`: owner only, 1 yocto, evented (`signer_key_added`, `signer_key_removed`). `role` must be an attester role (`price_publisher` keeps `add_price_publisher_key`). The account must hold the role, the key must be ed25519, `scopes` has 1 to 4 entries from the role's allowed set (`reserve_attester`: `reserves`, `custody`; `bridge_attester`: `bridge`; `attester`: `kyb`, `legal`, `custody`, `audit`), at most 8 keys per role, a key appears once per role. Revoking a role removes that account's keys of that role in the same call (event per key).
- Views: `get_signer_keys(role) -> Vec<SignerKey>` with `SignerKey {account_id, public_key, scopes, added_ms}`; `get_account_roles(account_id) -> Vec<String>` (snake_case names, `owner` first when the account is the owner).
- Helper other modules call: `verify_signer(role, public_key, scope, message, signature) -> Result<AccountId, SignerError>` (`unknown_key`, `scope_missing`, `bad_signature`); it returns the account the key is tied to.
- Separation: `grant_role` refuses `registrar` together with any attester role in either order. The owner holds neither (a rule already: the owner is not implicitly a role holder).

### 2. Custody registry (§6.1)

```jsonc
// Custodian (stored by id; ids follow validate_id)
{ "id": "vault-co-sim", "name": "Meridian Vault Co (SYNTHETIC)", "jurisdiction": "CH" | null,
  "attester_key": "ed25519:...", "status": "active" | "suspended" | "retired",
  "synthetic": true, "verification_status": "unverified" | "issuer_attested" | "third_party_attested",
  "evidence": [EvidenceRef], "registered_by": "reg.testnet", "registered_at_ms": 0 }
// CustodyLink (stored by representation id)
{ "representation_id": "tgold-a", "structure": "segregated" | "omnibus" | "on_chain_vault",
  "custodian_ids": ["vault-co-sim"], "linked_by": "reg.testnet", "linked_at_ms": 0 }
```

| Method                                                                                                 | Caller      | Notes                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register_custodian(custodian: NewCustodian)`                                                          | `registrar` | `NewCustodian {id, name, jurisdiction, attester_key, synthetic, verification_status, evidence: Vec<NewEvidence>}`. `attester_key` must be in `get_signer_keys(reserve_attester)` with scope `reserves`. The same evidence rules as 0009 apply |
| `set_custodian_status(id, status)`                                                                     | `registrar` | `active <-> suspended`, either to `retired` (terminal). Evented with from and to                                                                                                                                                              |
| `set_custodian_key(id, attester_key)`                                                                  | `registrar` | Rotation; the same registry check. Old key stops signing for this custodian at once                                                                                                                                                           |
| `link_custody(representation_id, structure, custodian_ids)`                                            | `registrar` | 1 to 4 distinct existing active custodians; replaces the link                                                                                                                                                                                 |
| Views: `get_custodian(id)`, `get_custodians(from_index, limit)`, `get_custody_link(representation_id)` | any         | Option or paged                                                                                                                                                                                                                               |

Events: `custodian_registered {id, attester_key, by, timestamp_ms}`, `custodian_status_changed {id, from, to, by, timestamp_ms}`, `custodian_key_set {id, attester_key, by, timestamp_ms}`, `custody_linked {representation_id, structure, custodian_ids, by, timestamp_ms}`.

A registrar cannot also be a reserve attester (section 1), so the account that registers a custodian can never sign that custodian's reserves.

### 3. Reserve attestations (§6.2)

**Signed payload.** Domain `b"pontis-reserve-v1"` then Borsh, bound to the contract account exactly as `price.rs` is:

```text
message = b"pontis-reserve-v1" ++ borsh(
  version: u8 = 1,
  contract: AccountId,          // string: u32 LE length + UTF-8
  representation_id: String,
  custodian_id: String,
  reserved_units: u128,         // 16 bytes LE; smallest units of the representation token
  as_of_ms: u64,
  report_hash: [u8; 32],        // raw bytes, no length prefix
  report_uri: String,
  simulated: bool,
  source: String )
```

`reserved_units` is in **token smallest units**, the unit of `ft_total_supply`, so the invariant needs no decimals or multiplier arithmetic. JSON carries `report_hash` as 64 lowercase hex characters and `reserved_units` as a decimal string.

```jsonc
// ReserveAttestation (JSON argument)
{
  "version": 1,
  "contract": "core.testnet",
  "representation_id": "tgold-a",
  "custodian_id": "vault-co-sim",
  "reserved_units": "1000000000000",
  "as_of_ms": 1790000000000,
  "report_hash": "<64 hex>",
  "report_uri": "sim://reserves/tgold-a/2026-11",
  "simulated": true,
  "source": "simulated_custodian",
}
```

**`submit_reserve_attestation(attestation, signature: Base64VecU8, public_key: PublicKey)`**: payable (1 yocto), anyone may relay, refused while paused. The signature is the authority. Accepted only if: `version == 1`; `contract` is this contract; the representation exists and is linked to `custodian_id`; the custodian is `active` and its `attester_key == public_key`; `verify_signer(reserve_attester, public_key, "reserves", message, signature)` passes (so a key removed from the registry, or whose role was revoked, stops working); `reserved_units <= 2^100`; `report_uri` at most 256 bytes; `source` at most 64; `as_of_ms <= now + 60 s`; `as_of_ms` is strictly greater than the stored latest for the same `(representation_id, custodian_id)` (no replay or rollback). Then it stores the latest, appends to history, emits `reserve_attested`, and evaluates the status (section 5).

**Storage.**

| Side map (key)                            | Value                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `reserve_latest` (`"{rep}\|{custodian}"`) | `ReserveRecord`                                                         |
| `reserve_history` (`(rep, seq % 500)`)    | `ReserveRecord`; a ring of the last 500 per representation              |
| `reserve_seq` (`rep`)                     | `u64`, the next sequence number (the count of attestations ever stored) |

```jsonc
// ReserveRecord
{
  "seq": 7,
  "custodian_id": "vault-co-sim",
  "reserved_units": "1000000000000",
  "as_of_ms": 0,
  "submitted_ms": 0,
  "report_hash": "<64 hex>",
  "report_uri": "...",
  "simulated": true,
  "source": "...",
  "attester_key": "ed25519:...",
}
```

Older history is in events and in the indexer's `reserve_attestations`; the ring exists so `get_reserve_history` works without an indexer.

**Views.** `get_reserve_attestation(representation_id, custodian_id: Option<String>) -> Option<ReserveRecord>` (the latest for that custodian, or the newest across custodians when omitted); `get_reserve_attestations(representation_id) -> Vec<ReserveRecord>` (the latest of each linked custodian); `get_reserve_history(representation_id, from_index, limit) -> {items: Vec<ReserveRecord>, total}` where the index is `seq` (entries older than `total - 500` are gone and skipped).

**Events.** `reserve_attested {representation_id, custodian_id, reserved_units, as_of_ms, report_hash, report_uri, simulated, source, attester_key, seq, timestamp_ms}`.

### 4. Reserve policy and supply (§6.2)

```jsonc
// ReservePolicy, set per representation by set_reserve_policy(representation_id, policy)  (owner only)
{ "tolerance_bps": 0,              // 0 to 1000
  "max_reserve_age_ms": 86400000,  // 60 000 to 2 592 000 000
  "action": "warn" | "restrict_conversions" | "pause_mint",
  "baseline_supply": "0" }         // token supply the mint ledger starts from; 0 for a token minted only through the gate
```

Event `reserve_policy_set {representation_id, policy, by, timestamp_ms}`. A representation with no policy is **unmonitored**: nothing below applies and the API says `unmonitored`. The setter is the owner, not the registrar: the policy loosens or tightens the safety invariant, so it is a deliberate act (a multisig owner is phase 7).

**Supply the contract trusts.** The contract cannot read the token inside a transaction without an async call, and it must not trust a reporter to say supply is low. It keeps three numbers per representation (side maps `supply_ledger`, `pending_mint`, `supply_read`):

- `ledger`: `baseline_supply` plus everything minted through the gate (section 6) minus everything burned by redemption (section 7), updated on confirmed token calls.
- `pending`: mint amounts reserved in flight, before the token call resolves.
- `read`: the last `ft_total_supply` result and its time, stored by the permissionless **`refresh_supply(representation_id)`** (1 yocto, anyone; the monitor calls it every minute). It makes a cross-contract view call to the token and a private callback `on_supply_read(representation_id)` stores the result and emits `reserve_supply_read {representation_id, supply, timestamp_ms}`. Burns by redemption lower the stored read (saturating) so a stale high read cannot understate headroom.

```text
circulating = max(ledger + pending, read.units)        // checked; overflow is a breach
```

The `max` is deliberate. Supply created outside the gate (a token whose owner still mints) can only raise `read`, so it shows as a breach; a stale low `read` cannot hide gated mints because the ledger counts them. `get_supply(representation_id) -> {ledger, pending, read: Option<{units, as_of_ms}>, circulating}` exposes it. This replaces the brief's "monitor posts a compact status": the **status is computed on demand** from signed attestations and these counters (section 5), so no off-chain job can write a favourable status, and the route guard reads only this contract's storage.

### 5. Invariant, status and route gate

```text
attested  = sum of the latest reserved_units of the active custodians linked to the representation
limit     = attested + floor(attested * tolerance_bps / 10_000)
breached  = circulating > limit
oldest    = min as_of_ms over those latest attestations
stale     = now - oldest > max_reserve_age_ms
state     = no_attestation                       // no active linked custodian has an attestation
          | breached                             // checked first among the rest
          | stale
          | ok
ratio_bps = floor(attested * 10_000 / circulating)    // None when circulating = 0
headroom  = attested - circulating, floored at 0      // the mint allowance: no tolerance applies to minting
```

`attested <= 100 * 2^100` and `limit <= 2^128` by the `2^100` cap per attestation and the 4-custodian cap; arithmetic is checked and an overflow reads as `breached`. A suspended or retired custodian contributes nothing, so suspending one lowers `attested` at once.

`get_reserve_status(representation_id) -> ReserveStatus`:

```jsonc
{ "monitored": true, "state": "ok" | "breached" | "stale" | "no_attestation" | "unmonitored",
  "action": "warn" | "restrict_conversions" | "pause_mint" | null, "tolerance_bps": 0, "max_reserve_age_ms": 0,
  "attested_units": "0", "limit_units": "0", "circulating_units": "0", "headroom_units": "0",
  "ratio_bps": 10000 | null, "oldest_as_of_ms": 0 | null, "age_ms": 0 | null,
  "supply_read_ms": 0 | null, "restricts_conversions": false, "mint_paused": false,
  "simulated": true,               // true when any contributing attestation is simulated
  "sources": ["simulated_custodian"] }
```

| Action                 | Conversions                                          | Mint                                                           |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| `warn`                 | unaffected; the status and events flag it            | still capped by `headroom`                                     |
| `restrict_conversions` | refused when `breached`, `stale` or `no_attestation` | still capped by `headroom`                                     |
| `pause_mint`           | as `restrict_conversions`                            | refused outright while `breached`, `stale` or `no_attestation` |

**Route gate.** `check_route` calls `check_reserves(from_id, to_id)` after the lifecycle and corporate-action checks. For each leg with an action other than `warn` it refuses: `breached` with `RouteRefusal::ReserveRestricted`; `stale` or `no_attestation` with `RouteRefusal::ReserveStale`. Both variants are appended; `RejectReason` gains `RESERVE_RESTRICTED` and `RESERVE_STALE` (appended) and `ConversionRejected` carries them. Both legs are checked because converting into an under-reserved token hands a user an unbacked claim, and converting out of one loads the vault with it. `get_route_guards` gains a `reserves` check line per monitored leg (`{name: "reserves", passed, detail: "<rep>: <state>, ratio <bps>"}`) and the API maps the refusals to `RESERVE_RESTRICTED` and `RESERVE_STALE` (HTTP 409, like the price refusals).

**Status events.** The contract stores the last state per representation (`reserve_state`). `evaluate_reserve(representation_id)` (1 yocto, anyone, not blocked by pause) recomputes and, when the state changed, emits `reserve_status_changed {representation_id, from_state, to_state, action, attested_units, circulating_units, ratio_bps, timestamp_ms}`. It runs automatically inside `submit_reserve_attestation`, `on_supply_read`, a mint and a burn. Staleness changes with time and nothing runs on its own, so the monitor calls `evaluate_reserve` for monitored representations each minute; the route check never depends on that call, because it recomputes from `now`.

### 6. Mint gating (§6.3)

**Choice: core-triggered mint through a `minter` role on the token, not a cross-contract headroom read from the token.** The token calling `get_mint_headroom` on the core is a check followed by an unlocked mint: two mints started in one block both see the same headroom, and the core can only learn what was minted afterwards. With the minter pattern the core is the only caller that can create supply, reserves the amount in `pending` **before** the token call (the pattern of [0008](0008-vault-inventory-and-funding.md): reserve, call, callback restores on failure), and so headroom is exact under concurrency. It also puts the ledger of section 4 in the one place that decides. The token stays ignorant of reserves; it only needs to know who may mint.

**`synthetic-token` changes** (owner-only, 1 yocto, evented as the existing admin methods):

- `set_minter(minter: Option<AccountId>)`: sets or clears the minter. While a minter is set the owner `mint` and `faucet_mint` fail (`minting is gated by the minter`), so the only way supply grows is `minter_mint`. Clearing it re-opens the owner and faucet paths; the owner can always do that, which is the demo's accepted trust ([0003](0003-admin-roles-and-pause.md), threat model).
- `minter_mint(account_id, amount)`: only the minter, not while paused, recipient registered. Event `ft_mint` as today.
- `minter_burn(amount)`: only the minter, burns from the minter's **own** balance (the escrow the core holds). There is no clawback of any other balance.
- Views `get_minter() -> Option<AccountId>`.

**Core methods.** The back-office is a test account listed in the representation's issuer `controlled_accounts` (an unproven registrar claim: proof of control was cut in [0019](0019-phase-3-scope-and-demo-issuers.md), so this is a labelled mock, not authentication of an issuer). The issuer must be `active`; the representation `active`.

```jsonc
// MintRequest, stored by u64 id in mint_requests (counter mint_seq; index mint_by_rep: rep -> Vec<u64>)
{ "id": 1, "representation_id": "tgold-a", "recipient": "alice.testnet", "amount": "5000000", "reference": "sub-0001",
  "status": "requested" | "minting" | "minted" | "failed" | "cancelled",
  "requested_by": "issuer-bo.testnet", "requested_ms": 0, "resolved_ms": 0 | null, "failure": null | "..." }
```

| Method                                                                                                                                                                                         | Effect                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request_mint(representation_id, recipient, amount: U128, reference: String) -> u64`                                                                                                           | Issuer account. `amount > 0`, `reference` at most 64 bytes. Records the intent (the subscription). Event `mint_requested {id, representation_id, recipient, amount, reference, requested_by, timestamp_ms}`                                                                                             |
| `execute_mint(request_id: u64)`                                                                                                                                                                | Issuer account. Needs `requested`, a policy, status not `pause_mint`-blocked, and `amount <= headroom` (else it panics with `exceeds reserve headroom`, nothing changes). Sets `minting`, `pending += amount`, calls `token.minter_mint(recipient, amount)` then private `on_mint_resolved(request_id)` |
| `on_mint_resolved(request_id)` (private callback)                                                                                                                                              | Success: `ledger += amount`, `pending -= amount`, `minted`, event `mint_completed {id, representation_id, recipient, amount, circulating_units, headroom_units, timestamp_ms}`. Failure: `pending -= amount`, `failed`, event `mint_failed {id, representation_id, reason, timestamp_ms}`               |
| `cancel_mint_request(request_id)`                                                                                                                                                              | The requester or any issuer account, while `requested`. Event `mint_cancelled {id, by, timestamp_ms}`                                                                                                                                                                                                   |
| Views: `get_mint_request(id)`, `get_mint_requests(representation_id, from_index, limit)`, `get_mint_headroom(representation_id) -> {headroom_units, circulating_units, attested_units, state}` | Plain reads                                                                                                                                                                                                                                                                                             |

A representation with no reserve policy cannot be minted through the gate (`no reserve policy`): an unmonitored token keeps its owner mint. The demo seed sets a policy and a minter on every reserve-backed demo token.

### 7. Redemption (§6.4)

**Terms (stored, enforced).** The free-text `redemption_terms` of the canonical asset stays a description. Enforced terms are structured data in the side map `redemption_terms` (representation id to record):

```jsonc
// RedemptionTerms (argument of set_redemption_terms, registrar only)
{ "min_amount": "1000000",          // > 0, smallest units
  "max_amount": "0",                // 0 = no maximum
  "fee_bps": 25,                    // 0 to 1000
  "window_anchor_ms": 0, "window_length_ms": 0, "window_period_ms": 0,   // period 0 = always open
  "accept_within_ms": 86400000,     // 1 000 to 2 592 000 000: the issuer's SLA to accept
  "settlement_days": 3 }            // 1 to 30: the issuer's time to fulfil after accepting
// stored record, returned by get_redemption_terms(representation_id)
{ "terms": {...}, "version": 2, "terms_hash": "<64 hex>", "set_by": "reg.testnet", "set_ms": 0 }
```

The window is open when `period == 0` or `((now - anchor) mod period) < length` and `now >= anchor` (`length <= period`, both non-zero when `period != 0`). `terms_hash = hex(sha256(b"pontis-redeem-terms-v1" ++ borsh(contract: AccountId, representation_id: String, version: u64, min_amount: u128, max_amount: u128, fee_bps: u16, window_anchor_ms: u64, window_length_ms: u64, window_period_ms: u64, accept_within_ms: u64, settlement_days: u16)))`. `version` starts at 1 and increases on every change, so identical terms set twice still differ. Event `redemption_terms_set {representation_id, version, terms_hash, terms, by, timestamp_ms}`. Changing terms never touches a request already created: each request keeps a snapshot.

**Request.** `ft_on_transfer(sender, amount, msg)` from the token of a representation, with

```text
msg = "redeem:" ++ terms_hash ++ ":" ++ payout_instruction_hash     // both 64 lowercase hex characters, no spaces
```

The brief's example `redeem:{terms_hash}` cannot carry the payout instruction hash, and one atomic transfer must, so the grammar is these two segments. The hash is `sha256` of the **ciphertext** of the payout instruction, which is encrypted and stored off-chain; the chain only sees the hash. A message that starts `redeem:` and does not match is refused `INVALID_MSG`; any other message goes to the existing `fund_vault` and conversion paths unchanged.

Accepted only if: the contract is not paused and the representation is `active` or `restricted` (exits stay possible from a restricted asset; `paused` and `deprecated` refuse); terms exist; `terms_hash` equals the stored one (else `TERMS_CHANGED`); `amount >= min_amount` and, if set, `<= max_amount`; the window is open; the sender has fewer than 20 open requests. There is no allowlist check: redemption is an exit right and an ineligible holder would otherwise be trapped (recorded in the threat model). The whole `amount` is escrowed (the call returns `0` unused). A refusal returns the whole amount and emits `redemption_refused {reason, sender_id, token, amount, timestamp_ms}` with `reason` one of `UNKNOWN_TOKEN`, `INVALID_MSG`, `PAUSED`, `ASSET_NOT_REDEEMABLE`, `TERMS_MISSING`, `TERMS_CHANGED`, `BELOW_MIN`, `ABOVE_MAX`, `WINDOW_CLOSED`, `TOO_MANY_OPEN`.

```jsonc
// Redemption (side map redemptions: u64 -> Redemption; counter redemption_seq; indexes redemptions_by_user, redemptions_by_rep: -> Vec<u64>)
{ "id": 1, "user": "alice.testnet", "representation_id": "tgold-a", "issuer_id": "meridian-sim",
  "amount": "5000000", "fee_bps": 25, "fee_units": "12500", "net_units": "4987500",   // fee = ceil(amount * fee_bps / 10_000)
  "terms_hash": "<64 hex>", "terms_version": 2, "payout_instruction_hash": "<64 hex>",
  "status": "requested" | "accepted" | "fulfilled" | "rejected" | "expired" | "reclaimed",
  "created_ms": 0, "accept_deadline_ms": 0,                // created + accept_within_ms
  "accepted_ms": null, "fulfil_deadline_ms": null,         // accepted + settlement_days * 86_400_000
  "resolved_ms": null, "fulfilment_evidence_hash": null, "reject_reason": null, "miss": null | "accept" | "fulfil",
  "settlement_days": 3 }
```

`fee_units` and `net_units` are what the issuer owes the user off-chain, recorded so the API can show them; the **full amount is escrowed and, on fulfilment, burned**. The contract moves no value other than the token.

**State machine.**

```text
            accept (issuer, before accept_deadline)         fulfil (issuer, before fulfil_deadline)
REQUESTED ------------------------------------> ACCEPTED ---------------------------------------> FULFILLED   (escrow burned)
    |  \ reject (issuer; or while ACCEPTED)         |
    |   `---------------------------------------> REJECTED --reclaim (user)--> RECLAIMED          (escrow returned)
    | expire (anyone, now > accept_deadline)        | expire (anyone, now > fulfil_deadline)
    `-----------------------------------------> EXPIRED  --reclaim (user)--> RECLAIMED            (escrow returned)
```

| Method                                         | Caller                | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accept_redemption(id)`                        | issuer account        | `requested`, `now <= accept_deadline_ms`; sets `accepted_ms`, `fulfil_deadline_ms`. Event `redemption_accepted`                                                                                                                                                                                                                                                                                                                                                          |
| `reject_redemption(id, reason: String)`        | issuer account        | `requested` or `accepted`; `reason` 1 to 64 bytes. Event `redemption_rejected`. Not blocked by pause. A reject is not a miss                                                                                                                                                                                                                                                                                                                                             |
| `fulfil_redemption(id, evidence_hash: String)` | issuer account        | `accepted`, `now <= fulfil_deadline_ms`, hash 64 hex. Sets `fulfilled` at once (so nothing else can move it), calls `token.minter_burn(amount)` then private `on_burn_resolved(id)`. Success: `ledger` and stored read lower by `amount`, `burned += amount`, event `redemption_fulfilled {id, evidence_hash, amount, circulating_units, timestamp_ms}`. Failure: back to `accepted`, event `redemption_fulfil_failed {id, timestamp_ms}`; counters move only on success |
| `expire_redemption(id)`                        | anyone                | `requested` past `accept_deadline_ms` or `accepted` past `fulfil_deadline_ms`; sets `expired` and `miss`, counts the miss against the issuer (once; the status change is the guard). Event `redemption_expired {id, miss, timestamp_ms}`. Not blocked by pause                                                                                                                                                                                                           |
| `reclaim_redemption(id)`                       | the redemption's user | `rejected` or `expired`; or `requested`/`accepted` past its deadline, in which case it expires first (both events in one call). Sets `reclaimed`, calls `token.ft_transfer(user, amount)` then private `on_reclaim_resolved(id)`. Success: `returned += amount`, event `redemption_reclaimed`. Failure (for example the user unregistered): back to the prior status, event `redemption_reclaim_failed`, retry later. Not blocked by pause                               |

The issuer account of a redemption is any account in the issuer's `controlled_accounts`, checked at call time against the representation's issuer.

**Escrow conservation.** Per representation the contract keeps `RedemptionLedger {escrowed_in, burned, returned}` and the view `get_escrow_ledger(representation_id)` returns those plus `held = escrowed_in - burned - returned` and `open_amount`, the sum of `amount` over requests in `requested`, `accepted`, `rejected` and `expired` (and in-flight ones). The invariant the tests assert after every transition:

```text
escrowed_in == burned + returned + held,   held == open_amount,   token balance of core >= inventory + pending_inbound + held
```

`burned` and `returned` move only when the token call succeeded, so an in-flight call leaves `held` unchanged and the books never claim a movement that did not happen.

**Issuer reliability.** Side map `issuer_reliability: issuer_id -> IssuerReliability`, `get_issuer_reliability(issuer_id)`:

```jsonc
{
  "issuer_id": "meridian-sim",
  "requested": 0,
  "accepted": 0,
  "fulfilled": 0,
  "rejected": 0,
  "expired": 0,
  "accept_misses": 0,
  "fulfil_misses": 0,
  "reclaimed": 0,
  "accept_latency_ms_total": "0",
  "settle_latency_ms_total": "0", // summed over accepted / fulfilled, for averages
  "last_miss_ms": null,
  "simulated": true,
}
```

`requested` increments at creation, `accepted` on accept, `fulfilled` on a successful burn (adding `now - created_ms` to `settle_latency_ms_total`), `rejected` on reject, `expired` and the matching miss on expiry, `reclaimed` on a successful return. The **score is not computed on chain**; the API derives it (fulfilled over requested, miss rates, averages) and labels it `simulated: true` while every issuer is a demo issuer.

**Events.** `redemption_requested {id, user, representation_id, issuer_id, amount, fee_bps, fee_units, terms_hash, terms_version, payout_instruction_hash, accept_deadline_ms, timestamp_ms}`, `redemption_accepted {id, accepted_ms, fulfil_deadline_ms, by, timestamp_ms}`, `redemption_rejected {id, reason, by, timestamp_ms}`, `redemption_fulfilled`, `redemption_fulfil_failed`, `redemption_expired`, `redemption_reclaimed {id, user, amount, timestamp_ms}`, `redemption_reclaim_failed`, `redemption_refused`, `redemption_terms_set`.

**Views.** `get_redemption(id) -> Option<Redemption>`, `get_redemptions_by_user(account_id, from_index, limit)`, `get_redemptions_by_representation(representation_id, from_index, limit)` (the issuer queue: the API filters by status), `get_redemption_terms(representation_id)`, `get_escrow_ledger(representation_id)`, `get_issuer_reliability(issuer_id)`.

### 8. Shared test vectors

All computed **independently in Python** (hand-written Borsh and sha256, no contract code) and reproduced by Rust unit tests and the TypeScript packages:

- `test-vectors/reserve-attestation.json`: the dev reserve attester seed, public key, one attestation, `message_hex`, `signature_base64` (the shape of `price-attestation.json`), plus a negative set (wrong contract, wrong custodian, one flipped bit) the contract must refuse.
- `test-vectors/redemption-terms.json`: terms records and their `terms_hash`, window openness cases `(anchor, length, period, now) -> open`, the `redeem:` grammar (accepted and refused strings) and fee cases (`amount, fee_bps -> fee_units, net_units`).
- `test-vectors/reserve-status.json`: `(attestations, supply, tolerance_bps, max_age, now) -> state, attested, limit, headroom, ratio_bps` including exact-boundary, zero-supply and overflow cases.

### 9. Tests

Unit tests per module (time through `testing_env!`; messages asserted in unit tests only, since a sandbox host panic is `WebAssembly trap: unreachable`, so sandbox tests assert state). Sandbox scenarios in `contracts/integration-tests/tests`: `custody_reserves.rs` (register custodian and link, attest, mint within headroom, mint above headroom refused, supply above reserves restricts the route and a new attestation reopens it, a stale attestation refuses with `reserve_stale`, forged and replayed attestations refused, a removed signer key refused) and `redemption.rs` (redeem and fulfil with burn, reject then reclaim, expire then reclaim, terms change refused, below minimum and closed window refused, and the conservation invariant after every step). These are the Definition of Done of §6.5 on chain.

### 10. API and indexer (written from this ADR)

**Mirror tables** (indexer, idempotent on `(tx_hash, event_index)` like the rest): `custodians`, `custody_links`, `reserve_policies`, `reserve_attestations` (every `reserve_attested`, the unbounded history), `reserve_supply_reads`, `reserve_status` (latest `reserve_status_changed` plus a refresh from `get_reserve_status` by the reconciler), `mint_requests`, `redemption_terms` (versions kept), `redemptions` (current row) and `redemption_events` (the timeline, one row per event), `issuer_reliability` (current counters from `get_issuer_reliability`, refreshed on every redemption event), `signer_keys` (from `signer_key_added/removed`).

**Public endpoints** (all carry `simulated` and `source`; ETag as the other reads):

- `GET /v1/custodians`, `GET /v1/custodians/{id}`.
- `GET /v1/assets/{id}/custody`: link, structure, custodians (the asset page).
- `GET /v1/assets/{id}/reserves`: current state, ratio, `attestedUnits`, `circulatingUnits`, `headroomUnits`, policy, per-custodian latest attestation with `reportUri`, `reportHash`, attester, age and freshness, `simulated`, `sources`. `GET /v1/assets/{id}/reserves/history?cursor&limit`.
- `GET /v1/assets/{id}/redemption-terms`: terms, `termsHash`, version, plus the human description.
- `GET /v1/issuers/{id}/reliability`: counters and the derived score, labelled simulated.
- `GET /v1/redemptions?user=&representationId=&status=&cursor&limit`, `GET /v1/redemptions/{id}`: the row and its timeline (`requested`, `accepted`, ... with transaction hashes).

**Session endpoints** (NEP-413 session of [0019](0019-phase-3-scope-and-demo-issuers.md); the API never signs a user transaction):

- `POST /v1/redemptions/prepare {representationId, amount, payoutInstruction}`: validates amount and window against the stored terms, stores the **encrypted** payout instruction (the client sends ciphertext; the demo stores it unread), and returns `{termsHash, payoutInstructionHash, msg, actions}` where `actions` is the unsigned `ft_transfer_call` for the wallet.
- `POST /v1/redemptions/{id}/reclaim-intent`: unsigned `reclaim_redemption` actions, only when reclaimable.
- `GET /v1/issuer/redemptions?status=`: the issuer queue for the signed-in account when its role set or the issuer's `controlled_accounts` covers it (read from chain); `POST /v1/issuer/redemptions/{id}/accept|reject|fulfil` return unsigned actions for the back-office wallet; the simulator back-office signs them with a dev key.
- `POST /v1/issuer/mint-requests` and `.../execute`: unsigned `request_mint` and `execute_mint` actions. `GET /v1/issuer/mint-requests`.

**Relays and jobs.** `POST /v1/reserves/attestations {attestation, signature, publicKey}` relays `submit_reserve_attestation` with the same rate limit and relayer account as price submissions (the signature is the authority). The simulator custodian signs reserves with the dev `reserve_attester` key and posts them. A monitor job (indexer) runs once a minute: `refresh_supply` and `evaluate_reserve` per monitored representation, and exposes `GET /v1/admin/reserve-monitor` (breaches, stale, last run).

**Errors.** `RESERVE_RESTRICTED` and `RESERVE_STALE` (409) on quotes for a refused route, `REDEMPTION_WINDOW_CLOSED`, `REDEMPTION_BELOW_MIN`, `REDEMPTION_ABOVE_MAX`, `REDEMPTION_TERMS_CHANGED` (409) on prepare.

## Consequences

- A reserve-backed token needs a running custodian signer and a monitor. If either stops, the status goes `stale` and a `restrict_conversions` token stops converting, which is the intended failure.
- Mint is exact under concurrency because only the core mints. The price is a token change (a minter) and the owner's ability to clear the minter; the threat model records it. A token that is not gated still has supply the ledger cannot see, which `refresh_supply` surfaces as a breach.
- The status is computed on read, so it costs a bounded loop over at most four custodians on every route check of a monitored asset.
- The redemption escrow is a held balance of the core on the token contract, on top of vault inventory and pending input; the sandbox test checks the three together against the core's token balance.
- Redemption pays no value. Fee and net are figures the issuer simulator honours off-chain; nothing models a fiat or custody transfer, and the docs say so.
- The history ring drops attestations older than the last 500 per representation on chain; the indexer keeps them.
- A reserve policy set by the owner is a single point of trust until the multisig owner of phase 7.
