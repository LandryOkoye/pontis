# Reserves, custody and the gated mint

A reserve-backed token converts and mints only while its attested reserves cover its supply ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)). Everything here is a simulation: the custodian is a simulator holding a dev key and no asset is held anywhere. Every call needs 1 yoctoNEAR.

## Set up a reserve-backed token (once)

```bash
# owner: an attester account and its signing key (separate from every registrar account)
near call $CORE grant_role '{"role":"reserve_attester","account_id":"custodian.testnet"}' --accountId $OWNER --depositYocto 1
near call $CORE add_signer_key '{"role":"reserve_attester","account_id":"custodian.testnet","public_key":"ed25519:...","scopes":["reserves"]}' --accountId $OWNER --depositYocto 1
# registrar: the custodian and its link to the representation
near call $CORE register_custodian '{"custodian":{"id":"vault-co-sim","name":"...","jurisdiction":"CH","attester_key":"ed25519:...","synthetic":true,"verification_status":"unverified","evidence":[...]}}' --accountId $REGISTRAR --depositYocto 1
near call $CORE link_custody '{"representation_id":"tgold-a","structure":"segregated","custodian_ids":["vault-co-sim"]}' --accountId $REGISTRAR --depositYocto 1
# owner: the policy, and core as the token's minter
near call $CORE set_reserve_policy '{"representation_id":"tgold-a","policy":{"tolerance_bps":0,"max_reserve_age_ms":86400000,"action":"restrict_conversions","baseline_supply":"0"}}' --accountId $OWNER --depositYocto 1
near call $TOKEN set_minter '{"minter":"core.testnet"}' --accountId $TOKEN_OWNER --depositYocto 1
```

`baseline_supply` must equal the token's supply at the moment you set the policy (0 for a token minted only through the gate) and cannot change afterwards. Setting the minter closes the owner `mint` and the faucet of that token.

## Read the state

`near view $CORE get_reserve_status '{"representation_id":"tgold-a"}'` gives `state` (`ok`, `breached`, `stale`, `no_attestation`, `unmonitored`), attested, limit, circulating and headroom. `get_supply` shows the ledger, mints in flight and the last token read; `get_route_guards` lists a `reserves` line per monitored leg.

## When quotes say `RESERVE_RESTRICTED` or `RESERVE_STALE`

| State            | Meaning                                                   | Do                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `breached`       | Circulating supply is above the limit                     | Check `get_supply`: a gate mint, or a token read above the ledger (supply made outside the gate). Do not widen the policy to clear it; post a real attestation or stop the excess |
| `stale`          | The oldest attestation is older than `max_reserve_age_ms` | Check the custodian simulator is signing; the route reopens when a fresh attestation lands                                                                                        |
| `no_attestation` | No active linked custodian has an attestation             | A suspended custodian counts for nothing; reactivate it or link another, then attest                                                                                              |

`reserve_status_changed` is emitted by `evaluate_reserve` (the monitor calls it each minute with `refresh_supply`); the route gate does not wait for it. Run both by hand: `near call $CORE refresh_supply '{"representation_id":"tgold-a"}' --accountId $ANY --depositYocto 1 --gas 100000000000000`.

## Mint within the headroom

The issuer's back office (an account in the issuer's `controlled_accounts`) calls `request_mint` then `execute_mint`. A mint above `headroom_units` panics and changes nothing; a failed token call releases the reservation and marks the request `failed`. Under `pause_mint` a breached, stale or unattested token refuses all mints.

## Rotate a custodian key

Register the new key as a signer key, then `set_custodian_key`; the old key stops signing for the custodian at once. Remove the old signer key last ([roles and signer keys](roles-and-signer-keys.md)).
