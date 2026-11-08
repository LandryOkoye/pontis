# ADR 0006: Quote signing model

- **Status:** Accepted
- **Date:** 2026-11-07
- **Brief items:** §7.4, §10.1, §13.2, §13.4, §14.3, §19.3
- **Related:** [0004](0004-compatibility-and-policy-versioning.md), [0007](0007-conversion-via-ft-transfer-call.md)

## Context

Execution must reject expired or altered quotes, and the backend must never hold user keys (brief §7.4, BuildPlan §2). The backend owns quote lifecycle, rate limiting and off-chain checks, so the contract needs proof that a quote came from it.

## Decision

1. **One ed25519 quote-signer key.** The backend holds the private key in an env var (`QUOTE_SIGNER_SECRET_KEY`, testnet only, never in git). `pontis-core` stores the public key (`set_quote_signer`, owner-only, evented) and verifies with `env::ed25519_verify`.
2. **Signed payload** (Borsh, field order as listed):

   | Field                                                | Type                                                              |
   | ---------------------------------------------------- | ----------------------------------------------------------------- |
   | `version`                                            | `u8` = 1                                                          |
   | `contract`                                           | `AccountId` of `pontis-core` (prevents replay across deployments) |
   | `user`                                               | `AccountId`                                                       |
   | `token_in`, `token_out`                              | `AccountId`                                                       |
   | `amount_in`, `amount_out_gross`, `fee`, `amount_out` | `u128`                                                            |
   | `fee_bps`                                            | `u16`                                                             |
   | `expires_at_ms`                                      | `u64`                                                             |
   | `nonce`                                              | `[u8; 16]`, random per quote                                      |
   | `compatibility_version`, `policy_version`            | `u64`                                                             |

   The signed message is `b"pontis-quote-v1" ++ borsh(payload)`. The prefix gives domain separation. The user passes `{quote, signature}` as JSON in `ft_transfer_call.msg`; the contract rebuilds the Borsh bytes from the JSON fields, so a TypeScript signer and the Rust verifier share one byte layout, pinned by shared test vectors (BuildPlan B10).

3. **The contract does not trust the signed numbers.** After the signature check it recomputes the output from the stored ratio and fee config and rejects any mismatch ([0001](0001-synthetic-claim-and-units.md)). It also checks expiry, `predecessor` equals `token_in`, `sender_id` equals `user`, `amount == amount_in`, versions, statuses, pauses, allowlist, inventory and nonce uniqueness ([0007](0007-conversion-via-ft-transfer-call.md)).
4. **Nonce / operation ID.** The nonce is the operation ID. It is marked used before any payout promise is created and **stays used even if the payout fails**; a failed conversion needs a new quote. Used nonces are kept in a contract set (no pruning in the MVP; accepted for testnet).
5. **Expiry** is 60 s from issue, set by the API. Contract time is `env::block_timestamp() / 1_000_000` in ms; a quote is valid only while `now_ms < expires_at_ms`.
6. **Rotation.** `set_quote_signer` replaces the key; there is no overlap window, so quotes signed by the old key fail. Rotation is also the response to key compromise.

## What a compromised signer can and cannot do

- **Can:** authorise conversions that skip the API's off-chain pre-checks and rate limits, and issue unlimited fresh nonces.
- **Cannot:** exceed the approved ratio or fee, bypass compatibility status, pause flags or allowlist, spend a user's tokens (the user's own wallet signs the transfer), or pay out more than vault inventory.

## Consequences

- The user's wallet is the only thing that authorises movement of the user's tokens.
- Replay across contracts, users, pairs and time is closed by the signed fields; replay within the same contract by the nonce set.
- A signed quote does not expose secrets; it is safe to log the quote ID but not the signer key.

## Amendments (B7, as implemented in `pontis-core`)

- **Wire format.** `msg` is `{"quote": {...}, "signature": "<base64>"}`. Quote fields are exactly the signed fields: `version`, `contract`, `user`, `token_in`, `token_out`, `amount_in`, `amount_out_gross`, `fee`, `amount_out` (decimal strings), `fee_bps`, `expires_at_ms`, `nonce` (32 lowercase hex characters), `compatibility_version`, `policy_version`. The signature is 64 bytes, standard base64.
- **One byte layout, two languages.** `test-vectors/quote-signing.json` holds a fixed seed, public key, quote, signed message and signature. The message was rebuilt independently in Python from the Borsh rules and matches the Rust output byte for byte. `packages/quote-engine` (B10) must reproduce the same message and signature.
- **Verification order.** Signer set (`SIGNER_NOT_SET`), nonce parses (`INVALID_MSG`), signature valid (`BAD_SIGNATURE`). Every other check runs only after the signature is valid, so a rejection event can carry the nonce.
- **Signer key type.** `set_quote_signer` accepts only ed25519 keys and works while the contract is paused, so a compromised key can be rotated during an incident.
