// Pure check that the facts of a transaction are the ones a conversion's quote demands. A wallet
// can report any hash, so what the chain says about it is compared with the quote, not trusted
// from the wallet.

import { z } from "zod";

export type TxAction =
  | {
      kind: "FunctionCall";
      methodName: string;
      /** The JSON arguments; `undefined` when they are not valid JSON. */
      args: unknown;
    }
  | { kind: "Other"; name: string };

/** What the chain says about one transaction. */
export interface TxFacts {
  signerId: string;
  receiverId: string;
  actions: TxAction[];
  /** IDs of every receipt the transaction produced, directly or through callbacks. */
  receiptIds: string[];
}

export interface ExpectedConversionTx {
  /** The wallet that signed the quote's `ft_transfer_call`. */
  signerId: string;
  /** The token contract of the quote's source asset. */
  tokenIn: string;
  coreId: string;
  /** Smallest units, decimal string. */
  amountIn: string;
  nonce: string;
  /**
   * Receipts of the conversion's settlement events, when the indexer has seen them. If any are
   * given, the transaction must have produced at least one of them.
   */
  settlementReceiptIds: readonly string[];
}

export type TxCheck = { ok: true } | { ok: false; reason: string };

const JsonObjectSchema = z.record(z.string(), z.unknown());
const MsgSchema = z.object({ quote: JsonObjectSchema });

const differs = (what: string, found: unknown, wanted: string): TxCheck => ({
  ok: false,
  reason: `${what} is ${typeof found === "string" ? found : JSON.stringify(found)}, expected ${wanted}`,
});

/** Pure: whether `facts` describe the transaction `expected` names, or the first fact that differs. */
export function checkConversionTransaction(
  facts: TxFacts,
  expected: ExpectedConversionTx,
): TxCheck {
  if (facts.signerId !== expected.signerId)
    return differs("signer", facts.signerId, expected.signerId);
  if (facts.receiverId !== expected.tokenIn)
    return differs("receiver", facts.receiverId, expected.tokenIn);
  const [action, ...rest] = facts.actions;
  if (!action || rest.length > 0)
    return { ok: false, reason: `expected one action, found ${facts.actions.length}` };
  if (action.kind !== "FunctionCall") return differs("action", action.name, "FunctionCall");
  if (action.methodName !== "ft_transfer_call")
    return differs("method", action.methodName, "ft_transfer_call");
  const parsedArgs = JsonObjectSchema.safeParse(action.args);
  if (!parsedArgs.success)
    return { ok: false, reason: "ft_transfer_call arguments are not a JSON object" };
  const args = parsedArgs.data;
  if (args.receiver_id !== expected.coreId)
    return differs("receiver_id", args.receiver_id, expected.coreId);
  if (args.amount !== expected.amountIn) return differs("amount", args.amount, expected.amountIn);
  let msg: unknown;
  try {
    msg = typeof args.msg === "string" ? JSON.parse(args.msg) : undefined;
  } catch {
    msg = undefined;
  }
  const parsedMsg = MsgSchema.safeParse(msg);
  if (!parsedMsg.success) return { ok: false, reason: "msg does not carry a quote" };
  const quote = parsedMsg.data.quote;
  if (quote.nonce !== expected.nonce) return differs("quote nonce", quote.nonce, expected.nonce);
  if (quote.user !== expected.signerId) return differs("quote user", quote.user, expected.signerId);
  if (
    expected.settlementReceiptIds.length > 0 &&
    !expected.settlementReceiptIds.some((id) => facts.receiptIds.includes(id))
  )
    return {
      ok: false,
      reason:
        "none of the receipts of the conversion's settlement events belong to this transaction",
    };
  return { ok: true };
}
