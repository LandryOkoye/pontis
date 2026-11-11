// The core account pays NEAR for the registry it stores (about 0.00001 NEAR per byte), and the deploy
// script funds it with only 1 NEAR beyond its code. The phase 1 catalogue fits in that; the full
// tier does not, so the seed tops the account up before it registers anything. Only records that
// are not on chain yet are counted, so repeating the seed does not top up again.

import { Account } from "near-api-js";
import type { Chain } from "./chain.ts";

const NEAR = 10n ** 24n;
/** The protocol's storage price: 1e19 yoctoNEAR per byte. */
export const STORAGE_BYTE_COST = 10n ** 19n;
/** Bytes stored per record beyond its JSON: the map key, the index entries and the borsh framing. */
const RECORD_OVERHEAD_BYTES = 300;
/** Left free after the records, so a later registry change does not fail for lack of balance. */
const BUFFER = NEAR;

/** An upper-leaning estimate of the state the records take: their JSON plus a per-record overhead. */
export function estimateStateBytes(payloads: readonly unknown[]): number {
  return payloads.reduce<number>(
    (sum, payload) => sum + JSON.stringify(payload).length + RECORD_OVERHEAD_BYTES,
    0,
  );
}

/** Whole NEAR (rounded up) to add so `available` covers `bytes` of new state and the buffer; 0 if it does. */
export function topUpFor(available: bigint, bytes: number): bigint {
  const short = BigInt(bytes) * STORAGE_BYTE_COST + BUFFER - available;
  return short <= 0n ? 0n : ((short + NEAR - 1n) / NEAR) * NEAR;
}

/** Tops up the core account for `payloads` that are about to be registered; returns the NEAR sent. */
export async function ensureStateFunding(
  chain: Chain,
  payloads: readonly unknown[],
): Promise<bigint> {
  const { coreId } = chain.config;
  const state = await new Account(coreId, chain.account.provider).getState();
  const amount = topUpFor(state.balance.available, estimateStateBytes(payloads));
  if (amount === 0n) return 0n;
  await chain.verifyNetwork();
  await chain.account.transfer({ receiverId: coreId, amount });
  console.log(`topped up ${coreId} with ${amount / NEAR} NEAR for the catalogue's registry state`);
  return amount;
}
