# Reserve relay and reserve refusals

Applies to the testnet and sandbox demo only. Every custodian and reserve figure here is simulated ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)); nothing is custodied, backed or audited.

## Configure the relayer

`POST /v1/reserves/attestations` forwards a custodian's signed attestation to `submit_reserve_attestation`. The signature is the authority, so the relayer only pays for the call.

1. Create or pick a dedicated testnet account that is not the owner or any role holder, and fund it with a few NEAR.
2. Set both variables in the API environment and restart it (`apps/api/.env`): `PONTIS_RELAYER_ACCOUNT_ID=relayer.<you>.testnet` and `PONTIS_RELAYER_SECRET_KEY=ed25519:...`. Setting one without the other stops the API at start.
3. Never use a user's key or a role holder's key. The relayer holds no custodian key.

Without them the endpoint answers `404 NOT_FOUND` ("not configured"), and so does fixtures mode. The call is in the write rate-limit class (`RATE_LIMIT_WRITE`).

## Symptoms

| Symptom                                         | Check                                                                                                                                                                                                     | Action                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `404` from the relay                            | The two `PONTIS_RELAYER_*` variables                                                                                                                                                                      | Configure them as above.                                                                                                                                                                       |
| `422 ATTESTATION_REJECTED`                      | The message carries the contract's reason: a signature that does not verify, a key that is not the custodian's, a custodian that is not active or not linked, an `as_of_ms` that is not newer, or a pause | Fix the signer (the key must be in the registry with scope `reserves` and be the custodian's `attester_key`), or the time; `unpause` if paused.                                                |
| Relay fails with a gas or balance error (`500`) | The relayer's balance on the explorer                                                                                                                                                                     | Top it up by hand.                                                                                                                                                                             |
| Quotes say `RESERVE_STALE`                      | `GET /v1/assets/{id}/reserves`: `state`, `ageMs`, `policy.maxReserveAgeMs`, per-custodian `latest`                                                                                                        | Start the simulated custodian so it signs again, or suspend nothing: a stale reserve closes the route by design. The route reopens as soon as a fresh attestation lands, with no other action. |
| Quotes say `RESERVE_RESTRICTED`                 | The same endpoint: `circulatingUnits` against `limitUnits`                                                                                                                                                | Attest a higher figure (simulated), or reduce supply. Supply created outside the mint gate shows as a breach until the minter is set; do not clear the minter to hide it.                      |

## How to know it worked

`GET /v1/assets/{id}/reserves` shows `state: "ok"` and `freshness: "fresh"`, and `POST /v1/routes/compare` for a pair of that asset no longer carries a `RESERVE_*` code.
