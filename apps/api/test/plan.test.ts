import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWalletPlan, type PlanInput } from "../src/conversions/plan.ts";

const vector = JSON.parse(
  readFileSync(new URL("../../../test-vectors/quote-signing.json", import.meta.url), "utf8"),
) as {
  quote: Record<string, string | number>;
  signature_base64: string;
};
const v = vector.quote;

/** A stored quote built from the shared signing vector, so the plan is checked against the contract's bytes. */
const row: PlanInput["quote"] = {
  id: "3f1f6b0e-8a4d-4c9b-9d52-0c1f6a7a1e10",
  accountId: v.user as string,
  fromId: "tgold-a",
  toId: "tgold-b",
  amountIn: v.amount_in as string,
  amountOutGross: v.amount_out_gross as string,
  fee: v.fee as string,
  amountOut: v.amount_out as string,
  ratioNum: "1000",
  ratioDen: "1",
  feeBps: v.fee_bps as number,
  nonce: v.nonce as string,
  signature: vector.signature_base64,
  expiresAt: new Date(v.expires_at_ms as number),
  compatibilityVersion: v.compatibility_version as number,
  policyVersion: v.policy_version as number,
  route: {},
  warnings: [],
  state: "ACCEPTED",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const input = (registered: boolean): PlanInput => ({
  quote: row,
  tokenIn: v.token_in as string,
  tokenOut: v.token_out as string,
  coreId: v.contract as string,
  userRegisteredOnTokenOut: registered,
});

describe("buildWalletPlan", () => {
  it("is a single ft_transfer_call whose msg is exactly the signed quote and signature", () => {
    const plan = buildWalletPlan(input(true));
    expect(plan).toHaveLength(1);
    const [call] = plan;
    expect(call).toMatchObject({
      receiverId: v.token_in,
      methodName: "ft_transfer_call",
      deposit: "1",
      gas: "100000000000000",
    });
    expect(call?.args).toMatchObject({ receiver_id: v.contract, amount: v.amount_in });
    expect(JSON.parse(String(call?.args.msg))).toEqual({
      quote: v,
      signature: vector.signature_base64,
    });
  });

  it("registers the user on the destination token first when they are not registered", () => {
    const plan = buildWalletPlan(input(false));
    expect(plan.map((a) => [a.receiverId, a.methodName])).toEqual([
      [v.token_out, "storage_deposit"],
      [v.token_in, "ft_transfer_call"],
    ]);
    expect(plan[0]?.args).toEqual({ account_id: v.user, registration_only: true });
  });

  it("keeps amounts, gas and deposits as strings", () => {
    for (const a of buildWalletPlan(input(false))) {
      expect([typeof a.gas, typeof a.deposit]).toEqual(["string", "string"]);
    }
  });
});
