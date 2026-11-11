// Operator commands for custody, reserves and the simulated custodian
// (docs/runbooks/reserves-and-redemption.md, ADR 0020). TESTNET AND SANDBOX ONLY, dev keys only:
// the custodian here is a simulator that signs with the public dev reserve-attester key, so every
// figure it publishes is `simulated: true` and nothing is custodied, backed or audited.
//
// Registrar commands (`register-custodian`, `link`) and owner commands (`grant-role`,
// `register-attester`, `set-policy`, `set-minter`) sign as the deployer account. `publish` submits
// as RELAYER_ACCOUNT_ID (and RELAYER_PRIVATE_KEY, or its NEAR credentials file) if set, else as the
// deployer: the signature on the attestation is the authority, the relayer only pays.
//
//   pnpm --filter @pontis/scripts reserves <command>      (run it without arguments for the list)

import { devKey } from "@pontis/dev-keys";
import { CoreClient, RpcClient } from "@pontis/near-client";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { admin, connect, type Chain } from "./lib/chain.ts";
import { loadConfig } from "./lib/config.ts";
import {
  addSignerKeyArgs,
  linkCustodyArgs,
  parseReservesArgs,
  registerCustodianArgs,
  setReservePolicyArgs,
  type ReservesCommand,
} from "./lib/reserve-ops.ts";
import {
  discoverTargets,
  relayerChain,
  tokenSupply,
  type RepresentationRef,
} from "./lib/reserve-chain.ts";
import {
  coverFor,
  loadCoverState,
  nextAsOfMs,
  reserveSubmission,
  saveCoverState,
  statePath,
} from "./lib/reserve-publish.ts";

export async function representations(chain: Chain): Promise<RepresentationRef[]> {
  const core = new CoreClient(new RpcClient({ url: chain.config.rpcUrl }), chain.config.coreId);
  return (await core.listRepresentations()).map((r) => ({
    id: r.id,
    account_id: r.account_id,
    issuer_id: r.issuer_id,
  }));
}

export interface PublishOptions {
  coverBps: number;
  custodianId: string | null;
}

/**
 * One round: a signed reserve attestation per monitored representation linked to a custodian that
 * holds the dev reserve-attester key. A refusal or a failed read is reported, never fatal: the
 * next round (or `--loop`) tries again.
 */
export async function publishOnce(
  chain: Chain,
  relayer: Chain,
  options: PublishOptions,
  lastAsOf: Map<string, number> = new Map(),
  nowMs: number = Date.now(),
  path: string = statePath(),
): Promise<void> {
  const { coreId } = chain.config;
  const view = chain.view.bind(chain);
  const { targets, skipped } = await discoverTargets(
    view,
    coreId,
    await representations(chain),
    devKey("reserve-attester").publicKey,
    options.custodianId,
  );
  for (const line of skipped) console.log(`skipped ${line}`);
  const state = loadCoverState(path);
  for (const target of targets) {
    const label = `${target.representationId}/${target.custodianId}`;
    try {
      const supply = await tokenSupply(view, target.tokenId);
      const coverBps = coverFor(state, target.representationId, options.coverBps);
      const asOfMs = nextAsOfMs(nowMs, lastAsOf.get(label));
      const s = reserveSubmission(target, supply, coverBps, asOfMs, coreId);
      await admin(relayer, coreId, "submit_reserve_attestation", s.args);
      lastAsOf.set(label, asOfMs);
      console.log(
        `${label}: attested ${s.reservedUnits} units for supply ${s.supply} at ${coverBps} bps cover (SIMULATED)`,
      );
    } catch (error) {
      console.error(`${label}: not published: ${String(error).split("\n")[0]}`);
    }
  }
  if (targets.length === 0) console.log("nothing to attest for (SIMULATED custodian idle)");
}

async function status(chain: Chain, only: string | null): Promise<void> {
  const { coreId } = chain.config;
  const state = loadCoverState(statePath());
  for (const rep of await representations(chain)) {
    if (only !== null && rep.id !== only) continue;
    const reserve = await chain.view(coreId, "get_reserve_status", { representation_id: rep.id });
    const link = await chain.view(coreId, "get_custody_link", { representation_id: rep.id });
    const override = state[rep.id];
    console.log(
      `${rep.id}: ${JSON.stringify(reserve)}\n  link ${JSON.stringify(link ?? null)}\n  simulator cover ${override === undefined ? "default" : `${override} bps (drift)`}`,
    );
  }
}

export async function run(chain: Chain, command: ReservesCommand): Promise<void> {
  const { coreId } = chain.config;
  switch (command.kind) {
    case "status":
      return status(chain, command.representationId);
    case "grant-role":
      await admin(chain, coreId, "grant_role", {
        role: command.role,
        account_id: command.accountId,
      });
      console.log(`granted ${command.role} to ${command.accountId}`);
      return;
    case "register-attester":
      await admin(chain, coreId, "add_signer_key", addSignerKeyArgs(command));
      console.log(
        `registered the dev reserve-attester key (${devKey("reserve-attester").publicKey}) for ${command.accountId}, scopes ${command.scopes.join(",")}; SIMULATED signer, simulated reserves only`,
      );
      return;
    case "register-custodian":
      await admin(chain, coreId, "register_custodian", registerCustodianArgs(command));
      console.log(
        `registered SIMULATED custodian ${command.id} (synthetic, ${command.verification})`,
      );
      return;
    case "link":
      await admin(chain, coreId, "link_custody", linkCustodyArgs(command));
      console.log(
        `${command.representationId} linked to ${command.custodianIds.join(", ")} (${command.structure}, SIMULATED)`,
      );
      return;
    case "set-policy":
      await admin(chain, coreId, "set_reserve_policy", setReservePolicyArgs(command));
      console.log(
        `${command.representationId} reserve policy set: ${command.policy.action}, tolerance ${command.policy.tolerance_bps} bps, max age ${command.policy.max_reserve_age_ms} ms`,
      );
      return;
    case "set-minter": {
      const rep = (await representations(chain)).find((r) => r.id === command.representationId);
      if (!rep) throw new Error(`unknown representation ${command.representationId}`);
      await admin(chain, rep.account_id, "set_minter", { minter: coreId });
      console.log(`${rep.account_id}: minter set to ${coreId}; only gated mints can create supply`);
      return;
    }
    case "drift": {
      const path = statePath();
      const state = loadCoverState(path);
      if (command.coverBps === null) delete state[command.representationId];
      else state[command.representationId] = command.coverBps;
      saveCoverState(path, state);
      console.log(
        command.coverBps === null
          ? `${command.representationId}: simulated cover back to the publish default`
          : `${command.representationId}: simulated cover ${command.coverBps} bps from the next publish`,
      );
      return;
    }
    case "publish": {
      const relayer = relayerChain(chain);
      const options = { coverBps: command.coverBps, custodianId: command.custodianId };
      const lastAsOf = new Map<string, number>();
      console.log(
        `SIMULATED custodian: dev reserve-attester key ${devKey("reserve-attester").publicKey}, relayer ${relayer.config.deployerId}`,
      );
      if (!command.loop) return publishOnce(chain, relayer, options, lastAsOf);
      for (;;) {
        try {
          await publishOnce(chain, relayer, options, lastAsOf);
        } catch (error) {
          console.error(`round failed, retrying: ${String(error).split("\n")[0]}`);
        }
        await sleep(command.intervalMs);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(connect(loadConfig()), parseReservesArgs(process.argv.slice(2)));
}
