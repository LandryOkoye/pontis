// Operator commands for the price guards (docs/runbooks/price-guards.md): register the demo price
// publisher, set the guard on a pair, publish simulated prices, and read the breakdown. Needs the
// deployer key (owner and compat approver on the demo deployment), like ops.
//
//   pnpm --filter @pontis/scripts guards <command>      (run it without arguments for the list)

import { devKey } from "@pontis/dev-keys";
import { CoreClient, RpcClient } from "@pontis/near-client";
import { pathToFileURL } from "node:url";
import { admin, connect, type Chain } from "./lib/chain.ts";
import { loadConfig } from "./lib/config.ts";
import { DEMO_GUARD, parseGuardsArgs, type GuardsCommand } from "./lib/guard-ops.ts";
import { priceSubmissions } from "./lib/price-relay.ts";

async function registry(chain: Chain) {
  const core = new CoreClient(new RpcClient({ url: chain.config.rpcUrl }), chain.config.coreId);
  return (await core.listRepresentations()).map((r) => ({
    id: r.id,
    canonicalAssetId: r.canonical_asset_id,
    decimals: r.decimals,
    unitMultiplier: { num: BigInt(r.unit_multiplier.num), den: BigInt(r.unit_multiplier.den) },
  }));
}

/** One relay round: every price the feed can make, newest first-come; a refusal is reported, not fatal. */
export async function publishOnce(
  chain: Chain,
  adjust?: Parameters<typeof priceSubmissions>[3],
): Promise<void> {
  const { coreId } = chain.config;
  for (const s of priceSubmissions(await registry(chain), Date.now(), coreId, adjust)) {
    try {
      await admin(chain, coreId, "submit_price", s.args);
      console.log(`${s.representationId}: published ${s.args.attestation.price} (simulated)`);
    } catch (error) {
      console.error(`${s.representationId}: refused: ${String(error).split("\n")[0]}`);
    }
  }
}

async function status(chain: Chain): Promise<void> {
  const { coreId } = chain.config;
  const view = <T>(method: string, args: Record<string, unknown>) =>
    chain.view<T>(coreId, method, args);
  const pair = { from_id: "tgold-a", to_id: "tgold-b", amount_in: "1000000" };
  console.log(JSON.stringify(await view("get_route_guards", pair), null, 2));
  for (const id of ["tgold-a", "tgold-b"]) {
    console.log(
      `${id} price: ${JSON.stringify(await view("get_price", { representation_id: id }))}`,
    );
  }
  console.log(
    `breaker: ${JSON.stringify(await view("get_circuit_breaker", { representation_a_id: "tgold-a", representation_b_id: "tgold-b" }))}`,
  );
}

export async function run(chain: Chain, command: GuardsCommand): Promise<void> {
  const { coreId } = chain.config;
  switch (command.kind) {
    case "status":
      return status(chain);
    case "register-publisher":
      await admin(chain, coreId, "add_price_publisher_key", {
        public_key: devKey("price-publisher").publicKey,
      });
      console.log("registered the dev price-publisher key (simulated prices only)");
      return;
    case "set-guard":
      await admin(chain, coreId, "set_route_guard", {
        representation_a_id: command.fromId,
        representation_b_id: command.toId,
        guard: DEMO_GUARD,
      });
      console.log(`guard set on ${command.fromId} / ${command.toId}`);
      return;
    case "publish": {
      if (command.loopSeconds === undefined) return publishOnce(chain);
      for (;;) {
        await publishOnce(chain);
        await new Promise((resolve) => setTimeout(resolve, command.loopSeconds! * 1000));
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(connect(loadConfig()), parseGuardsArgs(process.argv.slice(2)));
}
