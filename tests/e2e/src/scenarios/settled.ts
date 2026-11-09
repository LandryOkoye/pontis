// What the scenarios share about a conversion that has settled.

import { ENDPOINTS, type WalletAction } from "@pontis/api-types";
import { parse } from "../api.ts";
import type { User } from "../wallet.ts";
import type { World } from "../world.ts";

/** A conversion that settled, kept for the later steps. */
export interface Settled {
  user: User;
  conversionId: string;
  actions: WalletAction[];
  txHash: string;
  /** What the user received, in TGOLD-B smallest units. */
  received: bigint;
}

export const transaction = async (world: World, id: string) =>
  parse(await world.api.get(`/v1/transactions/${id}`), ENDPOINTS.getTransaction.response);
