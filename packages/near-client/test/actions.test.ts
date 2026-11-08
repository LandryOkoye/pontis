import { describe, expect, it } from "vitest";
import {
  CONVERSION_GAS,
  conversionMsg,
  faucetMintAction,
  ftTransferCallAction,
  storageDepositAction,
} from "../src/actions.ts";

describe("unsigned actions", () => {
  it("builds ft_transfer_call with exactly 1 yoctoNEAR and the 100 Tgas conversion budget", () => {
    const action = ftTransferCallAction({
      tokenId: "tgold-a.testnet",
      receiverId: "core.testnet",
      amount: "1000000",
      msg: "{}",
    });
    expect(action).toEqual({
      receiverId: "tgold-a.testnet",
      methodName: "ft_transfer_call",
      args: { receiver_id: "core.testnet", amount: "1000000", msg: "{}" },
      gas: "100000000000000",
      deposit: "1",
    });
    expect(CONVERSION_GAS).toBe(100_000_000_000_000n);
  });

  it("registers an account on the destination token with a refundable deposit", () => {
    const action = storageDepositAction({ tokenId: "tgold-b.testnet", accountId: "alice.testnet" });
    expect(action.methodName).toBe("storage_deposit");
    expect(action.args).toEqual({ account_id: "alice.testnet", registration_only: true });
    expect(BigInt(action.deposit)).toBeGreaterThan(0n);
  });

  it("builds a faucet mint with no deposit", () => {
    expect(faucetMintAction({ tokenId: "tgold-a.testnet", amount: "5" })).toMatchObject({
      methodName: "faucet_mint",
      args: { amount: "5" },
      deposit: "0",
    });
  });

  it("serialises the conversion message as the contract expects", () => {
    const msg = JSON.parse(conversionMsg({ version: 1 }, "c2ln"));
    expect(msg).toEqual({ quote: { version: 1 }, signature: "c2ln" });
  });

  it("never emits numbers for amounts, gas or deposits", () => {
    const action = ftTransferCallAction({ tokenId: "t", receiverId: "c", amount: "1", msg: "" });
    for (const v of [action.gas, action.deposit, action.args.amount])
      expect(typeof v).toBe("string");
  });
});
