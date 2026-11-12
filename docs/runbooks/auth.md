# Operator sign-in

Operators reach the admin endpoints (`/v1/admin/*`, `/metrics`) with a wallet session ([ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)). The signed message authorises a session only: the API never holds your key and nothing you sign here is a chain transaction. Testnet and synthetic assets only.

## Who may do what

The API reads your roles from `pontis-core.get_account_roles` and checks them against a table (`apps/api/src/auth/policy.ts`).

| Endpoint                       | Roles allowed (any one)                   | Roles re-read from the chain                |
| ------------------------------ | ----------------------------------------- | ------------------------------------------- |
| `GET /v1/admin/reconciliation` | owner, registrar, compat_approver, pauser | on every request (sensitive)                |
| `GET /v1/admin/metrics`        | owner, registrar, compat_approver, pauser | at most 60 seconds old                      |
| `GET /metrics` (Prometheus)    | owner, registrar, compat_approver, pauser | at most 60 seconds old; scrape with the key |

`attester`, `reserve_attester` and `bridge_attester` hold no operator read access: they sign attestations, not operate. An account with no role may sign in and gets `403 FORBIDDEN` on every admin endpoint. The pause and role grants themselves are chain transactions made with `ops` and a wallet, not through the API.

## Sign in from the frontend

See [Auth in the frontend handoff](../api/FRONTEND_HANDOFF.md#auth): `POST /v1/auth/challenge`, the wallet's `signMessage`, `POST /v1/auth/verify`, then `Authorization: Bearer <token>`. A session lasts 15 minutes from its last use and never more than 8 hours; `POST /v1/auth/logout` ends it at once.

## Sign in from a terminal (dev, e2e, a local operator)

This signs with a key from your environment or NEAR CLI credentials, so use it for testnet and the sandbox only.

```bash
export DEPLOYER_ACCOUNT_ID=<account>            # or pass --account
export NEAR_NETWORK_ID=testnet                  # testnet or sandbox; anything else is refused
export DEPLOYER_PRIVATE_KEY=ed25519:...         # or ~/.near-credentials/<network>/<account>.json
TOKEN=$(pnpm --silent --filter @pontis/scripts auth-login --api $API --token-only)
curl -s -H "Authorization: Bearer $TOKEN" $API/v1/auth/me | jq
curl -s -H "Authorization: Bearer $TOKEN" $API/v1/admin/reconciliation | jq
curl -s -X POST -H "Authorization: Bearer $TOKEN" $API/v1/auth/logout
```

`auth-login` prints who it signed in as, with the key type and roles, on stderr; without `--token-only` it prints the whole session as JSON.

**Success:** `/v1/auth/me` names your account and the roles you expect. **If it does not:**

| Answer                                                | Meaning and fix                                                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `401` "challenge is unknown, expired or already used" | More than 5 minutes passed, or the challenge was used. Request a new one                                                                       |
| `401` "key is not an access key of ..."               | The key does not belong to that account (check `--account` and the key)                                                                        |
| `401` "signature does not match"                      | The wallet signed other bytes: it must pass `message`, `recipient` and the decoded `nonce` exactly                                             |
| `429`                                                 | Sign-in attempts are limited per client address (the admin allowance, 10 a minute by default)                                                  |
| `403` on an admin endpoint                            | Signed in, but the account holds none of the roles above. Grant one (owner: `grant_role`); the API sees it within 60 seconds, or sign in again |
| `500` on verify                                       | The RPC node or the `get_account_roles` view failed. The challenge is not spent; retry                                                         |

Every sign-in, refusal and admin call is in `audit_log`: `actor` is the account, `actor_key` the access key, `action` one of `auth.sign_in`, `auth.sign_in_failed`, `auth.logout`, `admin.*.read`, `admin.forbidden`.

```sql
select at, actor, actor_key, action, subject from audit_log where action like 'auth.%' or action = 'admin.forbidden' order by at desc limit 50;
```

## Break-glass: the legacy admin key

`ADMIN_API_KEY` (at least 16 characters) still works on every admin endpoint when set: use it only when no wallet session is possible (the API cannot reach the RPC node that serves roles, the Prometheus scraper, the e2e run). Its calls are audited as `legacy-admin-key`; `detail.keyFingerprint` tells two keys apart. It is not a session: `/v1/auth/me` and logout refuse it. Unset, the path is closed.

**Rotate it** (after a leak, an operator leaving, or on a schedule):

1. Make a new key: `openssl rand -hex 24`.
2. Set `ADMIN_API_KEY` in the API's environment and restart the API (there is no hot reload). The old key stops working at once; sessions are unaffected.
3. Update the scraper and any script that holds it.
4. Check the log: `select at, detail from audit_log where actor = 'legacy-admin-key' order by at desc limit 5;` shows the new fingerprint, and a call with the old key now logs `admin.auth_failed`.

To turn break-glass off, unset `ADMIN_API_KEY` and restart. Phase 7 removes it.

## Housekeeping

Expired challenges and ended sessions are deleted an hour after they end, on the next challenge request. Nothing else needs doing. To end every session at once: `update auth_sessions set revoked_at = now() where revoked_at is null;`.
