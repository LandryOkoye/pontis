// What an applier needs to know about the event it is applying.

import type { DbTx } from "@pontis/db";

export interface Where {
  tx: DbTx;
  receiptId: string;
  logIndex: number;
  blockHeight: number;
}

export const date = (ms: number) => new Date(ms);
