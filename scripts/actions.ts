// Operator commands for corporate actions, lifecycle and NAV strikes
// (docs/runbooks/corporate-actions.md). Registrar commands sign as the deployer account.
// `approve`, `cancel` and `approve-delist` need a compat approver, and the contract refuses the
// approver who proposed: set APPROVER_ACCOUNT_ID (and APPROVER_PRIVATE_KEY, or its NEAR
// credentials file) to sign those as a second account.
//
//   pnpm --filter @pontis/scripts actions <command>      (run it without arguments for the list)

import { pathToFileURL } from "node:url";
import { admin, connect, type Chain } from "./lib/chain.ts";
import { loadConfig, loadDeployerKey, type ChainConfig } from "./lib/config.ts";
import type { ActionsCommand } from "./lib/action-types.ts";
import { parseActionsArgs } from "./lib/action-ops.ts";
import { navSubmission } from "./lib/nav-relay.ts";
import { registry } from "./guards.ts";

type Env = Record<string, string | undefined>;

/** The chain handle for compat-approver commands: the second account if configured. */
export function approverChain(chain: Chain, env: Env = process.env): Chain {
  const id = env.APPROVER_ACCOUNT_ID?.trim();
  if (!id) return chain;
  const config: ChainConfig = {
    ...chain.config,
    deployerId: id,
    deployerKey:
      env.APPROVER_PRIVATE_KEY?.trim() || loadDeployerKey(env, chain.config.networkId, id),
  };
  return connect(config);
}

export async function run(
  chain: Chain,
  command: ActionsCommand,
  nowMs = Date.now(),
): Promise<void> {
  const { coreId } = chain.config;
  const as = (c: Chain, method: string, args: Record<string, unknown>) =>
    admin(c, coreId, method, args);
  switch (command.kind) {
    case "propose": {
      const id = await as(chain, "propose_corporate_action", {
        action: {
          asset_id: command.assetId,
          kind: command.actionKind,
          announced_at_ms: command.announcedAtMs,
          ex_date_ms: command.exDateMs,
          effective_ms: command.effectiveMs,
          freeze_from_ms: command.freezeFromMs,
          freeze_until_ms: command.freezeUntilMs,
          multiplier_change: command.multiplierChange,
        },
      });
      console.log(
        `proposed ${command.actionKind} for ${command.assetId}; action id: ${String(id)}`,
      );
      return;
    }
    case "add-evidence":
      await as(chain, "add_corporate_action_evidence", {
        action_id: command.actionId,
        evidence: {
          uri: command.uri,
          sha256: command.sha256,
          provenance: command.provenance,
          description: command.description,
        },
      });
      console.log(`added ${command.provenance} evidence to ${command.actionId}`);
      return;
    case "approve":
      await as(approverChain(chain), "approve_corporate_action", {
        action_id: command.actionId,
        rationale: command.rationale,
      });
      console.log(`approved ${command.actionId}`);
      return;
    case "cancel":
      await as(approverChain(chain), "cancel_corporate_action", {
        action_id: command.actionId,
        reason: command.reason,
      });
      console.log(`cancelled ${command.actionId}`);
      return;
    case "apply":
      await as(chain, "apply_corporate_action", {
        action_id: command.actionId,
        representation_id: command.representationId,
        new_multiplier: command.newMultiplier,
      });
      console.log(`applied ${command.actionId} to ${command.representationId}`);
      return;
    case "settle":
      await as(chain, "settle_corporate_action", { action_id: command.actionId });
      console.log(`settled ${command.actionId}`);
      return;
    case "set-stage":
      await as(chain, "set_lifecycle_stage", {
        representation_id: command.representationId,
        to: command.to,
        evidence_hash: command.evidenceHash,
        note: command.note,
      });
      console.log(`${command.representationId} moved to ${command.to}`);
      return;
    case "set-flags":
      await as(chain, "set_lifecycle_flags", {
        representation_id: command.representationId,
        kind: command.assetKind,
        no_conversion: command.noConversion,
        bridge_only: command.bridgeOnly,
      });
      console.log(
        `${command.representationId}: kind ${command.assetKind}, no_conversion ${command.noConversion || command.bridgeOnly}, bridge_only ${command.bridgeOnly}`,
      );
      return;
    case "request-delist":
      await as(chain, "request_delist", {
        representation_id: command.representationId,
        evidence_hash: command.evidenceHash,
        note: command.note,
      });
      console.log(
        `delist requested for ${command.representationId}; another approver must approve`,
      );
      return;
    case "approve-delist":
      await as(approverChain(chain), "approve_delist", {
        representation_id: command.representationId,
      });
      console.log(`${command.representationId} delisted`);
      return;
    case "nav": {
      const args = navSubmission(
        await registry(chain),
        command.representationId,
        nowMs,
        coreId,
        command.windowMs,
        command.nav,
      );
      await as(chain, "submit_nav_strike", args);
      console.log(
        `${command.representationId}: NAV strike ${args.attestation.nav} open until ${new Date(args.attestation.cutoff_ms).toISOString()} (simulated)`,
      );
      return;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(connect(loadConfig()), parseActionsArgs(process.argv.slice(2)));
}
