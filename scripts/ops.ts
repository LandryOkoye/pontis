// Operator commands for the runbooks (docs/runbooks): pause and unpause, suspend and re-approve the
// pair, fund or withdraw the vault, and a read-only status. Needs the deployer key, like deploy.
//
//   pnpm --filter @pontis/scripts ops <command>      (run it without arguments for the list)

import { pathToFileURL } from "node:url";
import { admin, connect, type Chain } from "./lib/chain.ts";
import { loadConfig } from "./lib/config.ts";

const REPRESENTATIONS = ["tgold-a", "tgold-b"] as const;
type Representation = (typeof REPRESENTATIONS)[number];
const ACCOUNT_ID = /^[a-z0-9]+([_.-][a-z0-9]+)*$/;
const AMOUNT = /^[1-9][0-9]*$/;

export type OpsCommand =
  | { kind: "status" }
  | { kind: "pause" | "unpause" }
  | { kind: "pause-asset" | "unpause-asset"; representation: Representation }
  | { kind: "suspend-pair" | "approve-pair"; rationale: string }
  | { kind: "fund-vault"; representation: Representation; amount: string }
  | { kind: "withdraw"; representation: Representation; amount: string; receiver: string };

const USAGE =
  "usage: ops <status|pause|unpause|pause-asset <rep>|unpause-asset <rep>|suspend-pair <reason>|approve-pair <reason>|fund-vault <rep> <amount>|withdraw <rep> <amount> <receiver>>";

function representation(value: string | undefined): Representation {
  if (!REPRESENTATIONS.includes(value as Representation)) {
    throw new Error(`unknown representation ${String(value)}; use tgold-a or tgold-b`);
  }
  return value as Representation;
}

function amount(value: string | undefined): string {
  if (!value || !AMOUNT.test(value)) {
    throw new Error(`amount must be a positive integer in smallest units, got ${String(value)}`);
  }
  return value;
}

export function parseOpsArgs(argv: string[]): OpsCommand {
  const [kind, first, second, third] = argv;
  switch (kind) {
    case "status":
    case "pause":
    case "unpause":
      return { kind };
    case "pause-asset":
    case "unpause-asset":
      return { kind, representation: representation(first) };
    case "suspend-pair":
    case "approve-pair": {
      const rationale = argv.slice(1).join(" ").trim();
      if (!rationale) throw new Error(`${kind} needs a reason: it is recorded on chain`);
      return { kind, rationale };
    }
    case "fund-vault":
      return { kind, representation: representation(first), amount: amount(second) };
    case "withdraw": {
      if (!third || third.length < 2 || third.length > 64 || !ACCOUNT_ID.test(third)) {
        throw new Error(`invalid receiver account id: ${String(third)}`);
      }
      return {
        kind,
        representation: representation(first),
        amount: amount(second),
        receiver: third,
      };
    }
    default:
      throw new Error(USAGE);
  }
}

const tokenOf = (chain: Chain, rep: Representation) =>
  rep === "tgold-a" ? chain.config.tokenAId : chain.config.tokenBId;

async function status(chain: Chain): Promise<void> {
  const { coreId } = chain.config;
  const view = <T>(contract: string, method: string, args: Record<string, unknown> = {}) =>
    chain.view<T>(contract, method, args);
  console.log(`core ${coreId}`);
  console.log(`paused: ${String(await view(coreId, "is_paused"))}`);
  console.log(`fee: ${String(await view(coreId, "get_fee_bps"))} bps`);
  console.log(`quote signer: ${String(await view(coreId, "get_quote_signer"))}`);
  for (const rep of REPRESENTATIONS) {
    const inventory = await view<string>(coreId, "get_inventory", { representation_id: rep });
    const held = await view<string>(tokenOf(chain, rep), "ft_balance_of", { account_id: coreId });
    console.log(`${rep}: inventory ${String(inventory)}, held by the core ${String(held)}`);
  }
  const route = await view<{ executable: boolean; refusal: string | null }>(coreId, "get_route", {
    from_id: "tgold-a",
    to_id: "tgold-b",
  });
  const verdict = route?.executable ? "executable" : `refused (${String(route?.refusal)})`;
  console.log(`route tgold-a to tgold-b: ${verdict}`);
}

export async function run(chain: Chain, command: OpsCommand): Promise<void> {
  const { coreId } = chain.config;
  const pair = { representation_a_id: "tgold-a", representation_b_id: "tgold-b" };
  switch (command.kind) {
    case "status":
      return status(chain);
    case "pause":
    case "unpause":
      await admin(chain, coreId, command.kind);
      break;
    case "pause-asset":
      await admin(chain, coreId, "pause_asset", { id: command.representation });
      break;
    case "unpause-asset":
      await admin(chain, coreId, "unpause_asset", { id: command.representation });
      break;
    case "suspend-pair":
      await admin(chain, coreId, "suspend_compatibility", {
        ...pair,
        rationale: command.rationale,
      });
      break;
    case "approve-pair":
      await admin(chain, coreId, "approve_compatibility", {
        ...pair,
        rationale: command.rationale,
      });
      break;
    case "fund-vault": {
      // The owner mints test tokens to itself, then credits them to the vault through the token.
      const token = tokenOf(chain, command.representation);
      await admin(chain, token, "mint", {
        account_id: chain.config.deployerId,
        amount: command.amount,
      });
      await chain.call(
        token,
        "ft_transfer_call",
        { receiver_id: coreId, amount: command.amount, msg: "fund_vault" },
        { deposit: 1n },
      );
      break;
    }
    case "withdraw":
      await admin(chain, coreId, "withdraw_inventory", {
        representation_id: command.representation,
        amount: command.amount,
        receiver_id: command.receiver,
      });
      break;
  }
  console.log(`${command.kind}: done`);
  await status(chain);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(connect(loadConfig()), parseOpsArgs(process.argv.slice(2)));
}
