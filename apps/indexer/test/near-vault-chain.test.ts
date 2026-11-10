import { RpcClient } from "@pontis/near-client";
import { describe, expect, it } from "vitest";
import { nearVaultChain } from "../src/reconcile/near-vault-chain.ts";

describe("nearVaultChain", () => {
  it("counts spendable inventory plus held input, and reads the core's token balance", async () => {
    const views: { contract: string; method: string; args: unknown }[] = [];
    const answers: Record<string, string> = {
      get_inventory: "500",
      get_pending_inbound: "30",
      ft_balance_of: "480",
    };
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const { params } = JSON.parse(String(init?.body)) as { params: Record<string, string> };
      views.push({
        contract: params.account_id as string,
        method: params.method_name as string,
        args: JSON.parse(Buffer.from(params.args_base64 as string, "base64").toString()),
      });
      const answer = answers[params.method_name as string];
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { result: [...Buffer.from(JSON.stringify(answer))] } }),
      };
    }) as unknown as typeof fetch;
    const chain = nearVaultChain(
      new RpcClient({ url: "http://node", fetch: fetchImpl }),
      "core.testnet",
    );

    expect(await chain.inventory("tgold-a")).toBe("530");
    expect(await chain.balanceOf("tgold-a.testnet", "core.testnet")).toBe("480");
    expect(views).toEqual([
      { contract: "core.testnet", method: "get_inventory", args: { representation_id: "tgold-a" } },
      {
        contract: "core.testnet",
        method: "get_pending_inbound",
        args: { representation_id: "tgold-a" },
      },
      {
        contract: "tgold-a.testnet",
        method: "ft_balance_of",
        args: { account_id: "core.testnet" },
      },
    ]);
  });
});
