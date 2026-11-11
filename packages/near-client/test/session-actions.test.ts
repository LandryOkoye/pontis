// The unsigned actions behind the session endpoints (ADR 0020 section 10) and the `redeem:`
// message, checked against the grammar and method names of `pontis-core`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CORE_CALL_GAS,
  acceptRedemptionAction,
  executeMintAction,
  fulfilRedemptionAction,
  reclaimRedemptionAction,
  redeemMsg,
  rejectRedemptionAction,
  requestMintAction,
} from "../src/actions.ts";
import { CoreClient } from "../src/core.ts";
import { issuers, representations } from "../src/fixtures.ts";
import type { RpcClient } from "../src/rpc.ts";

interface VectorMessage {
  name: string;
  msg: string;
  valid_grammar: boolean;
}
const vectors = JSON.parse(
  readFileSync(new URL("../../../test-vectors/redemption-terms.json", import.meta.url), "utf8"),
) as { messages: VectorMessage[] };

/** The same check as `redemption.rs::parse_msg`: the prefix, two segments, 64 lowercase hex each. */
const parseMsg = (msg: string): [string, string] | null => {
  const m = /^redeem:([0-9a-f]{64}):([0-9a-f]{64})$/.exec(msg);
  return m ? [m[1] as string, m[2] as string] : null;
};

describe("redeemMsg", () => {
  const accepted = vectors.messages.find((m) => m.name === "accepted");

  it("builds the exact string the contract's shared vector accepts", () => {
    const [terms, payout] = parseMsg(accepted?.msg ?? "") ?? ["", ""];
    expect(redeemMsg(terms, payout)).toBe(accepted?.msg);
  });

  it("only ever builds messages the contract grammar accepts, and the vector refuses the rest", () => {
    for (const v of vectors.messages)
      expect(parseMsg(v.msg) !== null, v.name).toBe(v.valid_grammar);
    const built = redeemMsg("ab".repeat(32), "01".repeat(32));
    expect(parseMsg(built)).toEqual(["ab".repeat(32), "01".repeat(32)]);
  });

  it.each([
    ["short", "ab".repeat(31)],
    ["uppercase", "AB".repeat(32)],
    ["empty", ""],
    ["non-hex", `${"ab".repeat(31)}zz`],
  ])("refuses a %s hash in either position", (_n, bad) => {
    const ok = "ab".repeat(32);
    expect(() => redeemMsg(bad, ok)).toThrow();
    expect(() => redeemMsg(ok, bad)).toThrow();
  });
});

describe("core call actions", () => {
  const core = "core.testnet";
  const base = { receiverId: core, gas: CORE_CALL_GAS.toString(), deposit: "1" };

  it("names the contract's methods and arguments, with 1 yoctoNEAR", () => {
    expect(reclaimRedemptionAction(core, "7")).toEqual({
      ...base,
      methodName: "reclaim_redemption",
      args: { id: 7 },
    });
    expect(acceptRedemptionAction(core, "7").args).toEqual({ id: 7 });
    expect(rejectRedemptionAction(core, "7", "not eligible")).toMatchObject({
      methodName: "reject_redemption",
      args: { id: 7, reason: "not eligible" },
    });
    expect(fulfilRedemptionAction(core, "7", "e".repeat(64))).toMatchObject({
      methodName: "fulfil_redemption",
      args: { id: 7, evidence_hash: "e".repeat(64) },
    });
    expect(
      requestMintAction(core, {
        representationId: "tgold-a",
        recipient: "alice.testnet",
        amount: "5000000",
        reference: "sub-1",
      }),
    ).toEqual({
      ...base,
      methodName: "request_mint",
      args: {
        representation_id: "tgold-a",
        recipient: "alice.testnet",
        amount: "5000000",
        reference: "sub-1",
      },
    });
    expect(executeMintAction(core, "3")).toEqual({
      ...base,
      methodName: "execute_mint",
      args: { request_id: 3 },
    });
  });
});

describe("registry views the session endpoints use", () => {
  const client = (answer: unknown) => {
    const calls: { method: string; args: unknown }[] = [];
    const rpc = {
      view: async (_c: string, method: string, args: unknown) => {
        calls.push({ method, args });
        return answer;
      },
    } as unknown as RpcClient;
    return { core: new CoreClient(rpc, core), calls };
  };
  const core = "core.testnet";

  it("reads one issuer and one representation by id, null when unknown", async () => {
    const a = client(issuers[0]);
    expect(await a.core.getIssuer("synthetic-issuer-a")).toEqual(issuers[0]);
    expect(a.calls[0]).toEqual({ method: "get_issuer", args: { id: "synthetic-issuer-a" } });
    const b = client(representations[0]);
    expect(await b.core.getRepresentation("tgold-a")).toEqual(representations[0]);
    expect(b.calls[0]).toEqual({ method: "get_representation", args: { id: "tgold-a" } });
    expect(await client(null).core.getIssuer("x")).toBeNull();
    expect(await client(null).core.getRepresentation("x")).toBeNull();
  });
});
