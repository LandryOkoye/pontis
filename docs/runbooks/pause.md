# Pause procedure

Use when conversions must stop now: a suspected key compromise, a wrong ratio, a vault discrepancy, an issuer report. Pausing is fast on purpose; resuming is deliberate ([ADR 0003](../decisions/0003-admin-roles-and-pause.md)).

## Choose the scope

| Scope      | Command                       | Effect                                                                 | Who                |
| ---------- | ----------------------------- | ---------------------------------------------------------------------- | ------------------ |
| Everything | `ops pause`                   | Every route is refused (`ASSET_PAUSED`) at quote time and at execution | pauser             |
| One asset  | `ops pause-asset tgold-b`     | Routes touching that asset are refused                                 | pauser             |
| The pair   | `ops suspend-pair "<reason>"` | The relationship is `SUSPENDED`; outstanding quotes become invalid     | pauser or approver |

```bash
pnpm --filter @pontis/scripts ops pause
pnpm --filter @pontis/scripts ops status      # paused: true, route refused
```

The API follows within its registry-sync interval (15 s by default): new quotes are refused with `ASSET_PAUSED` or `RELATIONSHIP_SUSPENDED`. A quote signed before the pause that is sent anyway is refused by the contract and the input returned, so nothing needs cancelling.

## While paused

- Read-only checks still work: `ops status`, the admin report, the explorer.
- Vault funding is allowed; registry changes are not (except pausing an asset).
- Tell users: conversions are paused, no funds are at risk from the pause, and refused transfers are refunded.
- If the quote-signer key may be exposed, rotate it now: set a new key on chain (`ops` does not wrap this; call `set_quote_signer` with the owner key) and in the API's environment, then restart the API. Quotes signed with the old key stop verifying at once.

## Resume

1. Remove the cause and write down what it was.
2. Resume at the scope you paused:

   ```bash
   pnpm --filter @pontis/scripts ops unpause                     # owner only
   pnpm --filter @pontis/scripts ops unpause-asset tgold-b       # owner only; the record must still be complete
   pnpm --filter @pontis/scripts ops approve-pair "<why it is safe again>"   # approver; a new version
   ```

3. `ops status` shows `paused: false` and the route executable. Request a quote to confirm.

## Done when

`ops status` reports the route `executable`, a fresh quote is issued, and the reconciler's next run has no new findings.
