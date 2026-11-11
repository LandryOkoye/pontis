// The simulated issuer back-office (docs/runbooks/reserves-and-redemption.md, ADR 0020 section 7).
// TESTNET AND SANDBOX ONLY, dev key only: it polls the redemption queue of the representations it
// serves, accepts a redemption after --accept-after-ms and fulfils it after --fulfil-after-ms
// (counted from the acceptance) with the sha256 of a SIMULATED receipt. Nothing is paid out, and
// `--ignore <id>` leaves a redemption alone so it runs into its deadline and expires.
//
// It signs as BACKOFFICE_ACCOUNT_ID, which MUST be in the `controlled_accounts` of the issuer of
// each representation it serves. The key is BACKOFFICE_PRIVATE_KEY, or its NEAR credentials file,
// or else the public dev `issuer-backoffice` key (add it to that account first).
//
//   pnpm --filter @pontis/scripts backoffice [options]      (see the runbook)

import { devSecretKey } from "@pontis/dev-keys";
import { CoreClient, RpcClient } from "@pontis/near-client";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { admin, connect, type Chain } from "./lib/chain.ts";
import { loadConfig } from "./lib/config.ts";
import { planBackoffice } from "./lib/backoffice-plan.ts";
import {
  fetchRedemptions,
  parseBackofficeArgs,
  selectRepresentations,
  type BackofficeCommand,
} from "./lib/backoffice-ops.ts";
import { chainAs } from "./lib/reserve-chain.ts";

type Env = Record<string, string | undefined>;

/** The chain handle that signs as the back-office account. */
export function backofficeChain(chain: Chain, env: Env = process.env): Chain {
  const accountId = env.BACKOFFICE_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new Error("BACKOFFICE_ACCOUNT_ID is required (an account in controlled_accounts)");
  }
  const key = env.BACKOFFICE_PRIVATE_KEY?.trim();
  if (key) return chainAs(chain, accountId, key, env);
  // Without a key of its own, the credentials file wins over the public dev key.
  try {
    return chainAs(chain, accountId, undefined, env);
  } catch {
    return chainAs(chain, accountId, devSecretKey("issuer-backoffice"), env);
  }
}

/** One poll of every served representation; a failed call is reported and retried next round. */
export async function backofficeRound(
  office: Chain,
  command: BackofficeCommand,
  announced: Set<string>,
  nowMs: number = Date.now(),
): Promise<void> {
  const { coreId } = office.config;
  const view = office.view.bind(office);
  const core = new CoreClient(new RpcClient({ url: office.config.rpcUrl }), coreId);
  const selected = await selectRepresentations(
    view,
    coreId,
    (await core.listRepresentations()).map((r) => ({
      id: r.id,
      account_id: r.account_id,
      issuer_id: r.issuer_id,
    })),
    await core.listIssuers(),
    command,
    office.config.deployerId,
  );
  for (const note of selected.notes) {
    if (!announced.has(note)) console.log(`skipped ${note}`);
    announced.add(note);
  }
  const ignore = new Set(command.ignore);
  const delays = { acceptAfterMs: command.acceptAfterMs, fulfilAfterMs: command.fulfilAfterMs };
  for (const rep of selected.representations) {
    const redemptions = await fetchRedemptions(view, coreId, rep.id);
    for (const r of redemptions) {
      const note = `ignoring redemption ${r.id}`;
      if (ignore.has(r.id) && (r.status === "requested" || r.status === "accepted")) {
        if (!announced.has(note)) console.log(`${note} (${r.status}): left to expire`);
        announced.add(note);
      }
    }
    for (const step of planBackoffice(redemptions, delays, ignore, nowMs)) {
      try {
        if (step.kind === "accept") {
          await admin(office, coreId, "accept_redemption", { id: step.id });
          console.log(`${rep.id}: accepted redemption ${step.id} (SIMULATED issuer)`);
        } else {
          await admin(office, coreId, "fulfil_redemption", {
            id: step.id,
            evidence_hash: step.evidenceHash,
          });
          console.log(
            `${rep.id}: fulfilled redemption ${step.id}, SIMULATED receipt ${step.evidenceHash}`,
          );
        }
      } catch (error) {
        console.error(`${rep.id}: ${step.kind} ${step.id} failed: ${String(error).split("\n")[0]}`);
      }
    }
  }
}

export async function run(
  chain: Chain,
  command: BackofficeCommand,
  env: Env = process.env,
): Promise<void> {
  const office = backofficeChain(chain, env);
  console.log(
    `SIMULATED issuer back-office as ${office.config.deployerId}; accept after ${command.acceptAfterMs} ms, fulfil after ${command.fulfilAfterMs} ms, ignoring [${command.ignore.join(", ")}]`,
  );
  const announced = new Set<string>();
  for (;;) {
    try {
      await backofficeRound(office, command, announced);
    } catch (error) {
      if (command.once) throw error;
      console.error(`round failed, retrying: ${String(error).split("\n")[0]}`);
    }
    if (command.once) return;
    await sleep(command.intervalMs);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(connect(loadConfig()), parseBackofficeArgs(process.argv.slice(2)));
}
