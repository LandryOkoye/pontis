// Adds or removes accounts on the pontis-core allowlist (ADR 0005). Membership changes are live
// at once and do not bump policy_version.
//
//   pnpm --filter @pontis/scripts allowlist add <tgold-a|tgold-b|all> alice.testnet bob.testnet
//   pnpm --filter @pontis/scripts allowlist remove all alice.testnet

import { pathToFileURL } from "node:url";
import { admin, connect } from "./lib/chain.ts";
import { loadConfig } from "./lib/config.ts";

const REPRESENTATIONS = ["tgold-a", "tgold-b"] as const;
const ACCOUNT_ID = /^[a-z0-9]+([_.-][a-z0-9]+)*$/;
const BATCH = 50;

export interface AllowlistCommand {
  allowed: boolean;
  representations: string[];
  accounts: string[];
}

export function parseAllowlistArgs(argv: string[]): AllowlistCommand {
  const [action, target, ...accounts] = argv;
  if (action !== "add" && action !== "remove")
    throw new Error("usage: allowlist <add|remove> <tgold-a|tgold-b|all> <account...>");
  if (target !== "all" && !REPRESENTATIONS.includes(target as (typeof REPRESENTATIONS)[number])) {
    throw new Error(`unknown representation ${String(target)}; use tgold-a, tgold-b or all`);
  }
  if (accounts.length === 0) throw new Error("provide at least one account");
  const invalid = accounts.find((a) => a.length < 2 || a.length > 64 || !ACCOUNT_ID.test(a));
  if (invalid) throw new Error(`invalid NEAR account id: ${invalid}`);
  return {
    allowed: action === "add",
    representations: target === "all" ? [...REPRESENTATIONS] : [target as string],
    accounts: [...new Set(accounts)],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = parseAllowlistArgs(process.argv.slice(2));
  const chain = connect(loadConfig());
  for (const representation_id of command.representations) {
    for (let i = 0; i < command.accounts.length; i += BATCH) {
      const account_ids = command.accounts.slice(i, i + BATCH);
      await admin(chain, chain.config.coreId, "set_allowlist", {
        representation_id,
        account_ids,
        allowed: command.allowed,
      });
      console.log(
        `${command.allowed ? "allowed" : "removed"} ${account_ids.join(", ")} on ${representation_id}`,
      );
    }
  }
}
