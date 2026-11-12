import { describe, expect, it } from "vitest";
import { conversionTxFacts } from "../src/fixtures.ts";
import {
  checkConversionTransaction,
  type ExpectedConversionTx,
  type TxFacts,
} from "../src/transaction-check.ts";

const expected: ExpectedConversionTx = {
  signerId: "alice.testnet",
  tokenIn: "tgold-a.testnet",
  coreId: "core.testnet",
  amountIn: "1000000",
  nonce: "ab".repeat(16),
  settlementReceiptIds: [],
};

describe("checkConversionTransaction", () => {
  it("accepts the transaction the quote describes", () => {
    expect(checkConversionTransaction(conversionTxFacts(expected), expected)).toEqual({ ok: true });
  });

  const call = (args: Record<string, unknown>): Partial<TxFacts> => ({
    actions: [{ kind: "FunctionCall", methodName: "ft_transfer_call", args }],
  });
  const msg = (quote: Record<string, unknown>) => JSON.stringify({ quote });
  const base = { receiver_id: "core.testnet", amount: "1000000" };

  it.each<[string, Partial<TxFacts>, RegExp]>([
    ["another wallet", { signerId: "mallory.testnet" }, /signer is mallory/],
    ["another token", { receiverId: "other.testnet" }, /receiver is other/],
    [
      "another method",
      { actions: [{ kind: "FunctionCall", methodName: "ft_transfer", args: {} }] },
      /method is ft_transfer/,
    ],
    ["a transfer", { actions: [{ kind: "Other", name: "Transfer" }] }, /action is Transfer/],
    [
      "two actions",
      { actions: [...conversionTxFacts(expected).actions, ...conversionTxFacts(expected).actions] },
      /found 2/,
    ],
    [
      "another core",
      call({
        ...base,
        receiver_id: "evil.testnet",
        msg: msg({ user: "alice.testnet", nonce: expected.nonce }),
      }),
      /receiver_id is evil/,
    ],
    [
      "another amount",
      call({ ...base, amount: "1", msg: msg({ user: "alice.testnet", nonce: expected.nonce }) }),
      /amount is 1,/,
    ],
    [
      "another nonce",
      call({ ...base, msg: msg({ user: "alice.testnet", nonce: "cd".repeat(16) }) }),
      /quote nonce is cd/,
    ],
    [
      "another quote user",
      call({ ...base, msg: msg({ user: "bob.testnet", nonce: expected.nonce }) }),
      /quote user is bob/,
    ],
    ["a msg that is not JSON", call({ ...base, msg: "hello" }), /does not carry a quote/],
    [
      "arguments that are not an object",
      { actions: [{ kind: "FunctionCall", methodName: "ft_transfer_call", args: undefined }] },
      /not a JSON object/,
    ],
  ])("refuses %s", (_name, over, reason) => {
    const result = checkConversionTransaction(conversionTxFacts(expected, over), expected);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(reason);
  });

  it("needs one of the settlement receipts when they are known", () => {
    const bound = { ...expected, settlementReceiptIds: ["settle-1", "settle-2"] };
    expect(checkConversionTransaction(conversionTxFacts(bound), bound)).toEqual({ ok: true });
    const other = conversionTxFacts(bound, { receiptIds: ["unrelated"] });
    expect(checkConversionTransaction(other, bound).ok).toBe(false);
  });
});
