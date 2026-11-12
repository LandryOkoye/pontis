// Looks a reported transaction hash up on the RPC node and decides whether it is a conversion's.
// The node is trusted to report the chain honestly (see docs/known-limitations.md).

import { z } from "zod";
import { RpcError, type RpcClient } from "./rpc.ts";
import {
  checkConversionTransaction,
  type ExpectedConversionTx,
  type TxAction,
  type TxFacts,
} from "./transaction-check.ts";

export interface TxVerifier {
  /** The facts of the transaction `hash` signed by `signerId`, or `undefined` if the node does not know it. Throws when the node cannot be asked. */
  getTransaction(hash: string, signerId: string): Promise<TxFacts | undefined>;
}

const TxStatusSchema = z.object({
  transaction: z.object({
    signer_id: z.string(),
    receiver_id: z.string(),
    actions: z.array(z.unknown()),
  }),
  receipts_outcome: z.array(z.object({ id: z.string() })),
});

const FunctionCallSchema = z.object({
  FunctionCall: z.object({ method_name: z.string(), args: z.string() }),
});

function toAction(raw: unknown): TxAction {
  const call = FunctionCallSchema.safeParse(raw);
  if (call.success) {
    const { method_name: methodName, args } = call.data.FunctionCall;
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(args, "base64").toString("utf8"));
    } catch {
      decoded = undefined;
    }
    return { kind: "FunctionCall", methodName, args: decoded };
  }
  const name =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object"
        ? Object.keys(raw)[0]
        : undefined;
  return { kind: "Other", name: name ?? "unknown" };
}

// Causes a node reports for a hash that is not (yet) an executed transaction it knows of.
const NOT_FOUND_CAUSES = new Set(["UNKNOWN_TRANSACTION", "TIMEOUT_ERROR", "PARSE_ERROR"]);

/** Reads transactions with the `tx` RPC method, waiting until the transaction has executed. */
export class RpcTxVerifier implements TxVerifier {
  constructor(private readonly rpc: RpcClient) {}

  async getTransaction(hash: string, signerId: string): Promise<TxFacts | undefined> {
    let result: unknown;
    try {
      result = await this.rpc.call("tx", {
        tx_hash: hash,
        sender_account_id: signerId,
        wait_until: "EXECUTED_OPTIMISTIC",
      });
    } catch (error) {
      if (error instanceof RpcError && error.causeName && NOT_FOUND_CAUSES.has(error.causeName))
        return undefined;
      throw error;
    }
    const status = TxStatusSchema.parse(result);
    return {
      signerId: status.transaction.signer_id,
      receiverId: status.transaction.receiver_id,
      actions: status.transaction.actions.map(toAction),
      receiptIds: status.receipts_outcome.map((r) => r.id),
    };
  }
}

/** What a conversion's transaction must look like. */

export type TxVerdict =
  | { outcome: "VERIFIED"; receiptIds: string[] }
  /** The transaction exists and is not this conversion's. */
  | { outcome: "MISMATCH"; reason: string }
  /** The node does not know the hash: it may not have propagated yet, or never existed. */
  | { outcome: "NOT_FOUND" }
  /** The node could not be asked, or answered something unreadable. */
  | { outcome: "UNAVAILABLE"; error: string };

/** Looks `hash` up and checks it; node failures become `UNAVAILABLE` for the caller to log and retry. */
export async function verifyConversionTransaction(
  verifier: TxVerifier,
  hash: string,
  expected: ExpectedConversionTx,
): Promise<TxVerdict> {
  let facts: TxFacts | undefined;
  try {
    facts = await verifier.getTransaction(hash, expected.signerId);
  } catch (error) {
    return {
      outcome: "UNAVAILABLE",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (!facts) return { outcome: "NOT_FOUND" };
  const check = checkConversionTransaction(facts, expected);
  return check.ok
    ? { outcome: "VERIFIED", receiptIds: facts.receiptIds }
    : { outcome: "MISMATCH", reason: check.reason };
}
