import type { PrivateOrder } from "./private-crypto.ts";

export function validateOrder(order: PrivateOrder, now: number): void {
  if (
    !Number.isSafeInteger(order.expiryMs) ||
    order.expiryMs <= now ||
    !Number.isSafeInteger(order.createdAtMs) ||
    order.createdAtMs > now
  ) {
    throw new Error("Order expired or timestamp invalid");
  }
}

export function crosses(incoming: PrivateOrder, resting: PrivateOrder): boolean {
  const incomingPrice = BigInt(incoming.limitPrice);
  const restingPrice = BigInt(resting.limitPrice);
  return incoming.side === "buy" ? incomingPrice >= restingPrice : incomingPrice <= restingPrice;
}

export function comparePriority(a: PrivateOrder, b: PrivateOrder): number {
  if (a.side === "buy" && BigInt(a.limitPrice) !== BigInt(b.limitPrice)) {
    return BigInt(a.limitPrice) > BigInt(b.limitPrice) ? -1 : 1;
  }
  if (a.side === "sell" && BigInt(a.limitPrice) !== BigInt(b.limitPrice)) {
    return BigInt(a.limitPrice) < BigInt(b.limitPrice) ? -1 : 1;
  }
  return a.createdAtMs - b.createdAtMs;
}

export function deviationBps(price: bigint, oracle: bigint): bigint {
  const diff = price >= oracle ? price - oracle : oracle - price;
  return (diff * 10_000n) / oracle;
}
