import { describe, expect, it } from "vitest";
import { conversionTxFacts } from "../src/fixtures.ts";
import { RpcClient } from "../src/rpc.ts";
import {
  RpcTxVerifier,
  verifyConversionTransaction,
  type TxVerifier,
} from "../src/transactions.ts";
import type { ExpectedConversionTx } from "../src/transaction-check.ts";

const expected: ExpectedConversionTx = {
  signerId: "alice.testnet",
  tokenIn: "tgold-a.testnet",
  coreId: "core.testnet",
  amountIn: "1000000",
  nonce: "ab".repeat(16),
  settlementReceiptIds: [],
};

describe("verifyConversionTransaction", () => {
  const verifier = (get: TxVerifier["getTransaction"]): TxVerifier => ({ getTransaction: get });

  it("maps the facts, a missing transaction and a failing node to the four outcomes", async () => {
    const facts = conversionTxFacts(expected);
    expect(
      await verifyConversionTransaction(
        verifier(async () => facts),
        "h",
        expected,
      ),
    ).toEqual({
      outcome: "VERIFIED",
      receiptIds: facts.receiptIds,
    });
    const wrong = conversionTxFacts(expected, { signerId: "mallory.testnet" });
    expect(
      await verifyConversionTransaction(
        verifier(async () => wrong),
        "h",
        expected,
      ),
    ).toMatchObject({ outcome: "MISMATCH" });
    expect(
      await verifyConversionTransaction(
        verifier(async () => undefined),
        "h",
        expected,
      ),
    ).toEqual({ outcome: "NOT_FOUND" });
    expect(
      await verifyConversionTransaction(
        verifier(async () => {
          throw new Error("rpc down");
        }),
        "h",
        expected,
      ),
    ).toEqual({ outcome: "UNAVAILABLE", error: "rpc down" });
  });
});

describe("RpcTxVerifier", () => {
  const rpcWith = (handler: (params: Record<string, unknown>) => unknown) =>
    new RpcTxVerifier(
      new RpcClient({
        url: "http://rpc",
        fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as { params: Record<string, unknown> };
          return { ok: true, status: 200, json: async () => handler(body.params) };
        }) as unknown as typeof fetch,
      }),
    );
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");

  it("reads signer, receiver, decoded call arguments and all receipt IDs", async () => {
    let seen: Record<string, unknown> = {};
    const verifier = rpcWith((params) => {
      seen = params;
      return {
        result: {
          transaction: {
            signer_id: "alice.testnet",
            receiver_id: "tgold-a.testnet",
            actions: [
              { FunctionCall: { method_name: "ft_transfer_call", args: b64({ amount: "1" }) } },
              "CreateAccount",
            ],
          },
          receipts_outcome: [{ id: "r1" }, { id: "r2" }],
        },
      };
    });
    expect(await verifier.getTransaction("HASH", "alice.testnet")).toEqual({
      signerId: "alice.testnet",
      receiverId: "tgold-a.testnet",
      actions: [
        { kind: "FunctionCall", methodName: "ft_transfer_call", args: { amount: "1" } },
        { kind: "Other", name: "CreateAccount" },
      ],
      receiptIds: ["r1", "r2"],
    });
    expect(seen).toMatchObject({ tx_hash: "HASH", sender_account_id: "alice.testnet" });
  });

  it("treats an unknown transaction as not found and any other node error as a failure", async () => {
    const unknown = rpcWith(() => ({
      error: { code: -32000, message: "Server error", cause: { name: "UNKNOWN_TRANSACTION" } },
    }));
    expect(await unknown.getTransaction("H", "alice.testnet")).toBeUndefined();
    const broken = rpcWith(() => ({
      error: { code: -32000, message: "Server error", cause: { name: "INTERNAL_ERROR" } },
    }));
    await expect(broken.getTransaction("H", "alice.testnet")).rejects.toThrow(/Server error/);
    const malformed = rpcWith(() => ({ result: { nonsense: true } }));
    await expect(malformed.getTransaction("H", "alice.testnet")).rejects.toThrow();
  });
});
