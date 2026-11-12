// GET /v1/issuer/redemptions (ADR 0020 section 10) and the merge shared with the mint queue: the
// back-office queues, read from the chain. The contract lists by representation and by account, so a queue is
// the newest requests of each representation the caller may read, merged by id (ids are one
// counter, so "older than id N" is a cursor that survives new arrivals). The scan of each
// representation is bounded; a payout instruction is never part of any of it.

import type { IssuerRedemptionList } from "@pontis/api-types";
import type { RedemptionStatus } from "@pontis/domain";
import type { Db } from "@pontis/db";
import { decodeCursor, encodeCursor } from "../market/cursor.ts";
import type { CustodyRepository } from "./chain.ts";
import type { Caller } from "./intent-context.ts";
import { readableRepresentations } from "./issuer-access.ts";
import { CUSTODY_NOTICE, ISSUER_SOURCE } from "./labels.ts";
import { scanNewest } from "./paging.ts";
import { redemptionSummary } from "./redemptions.ts";

/** How many of the newest requests of one representation a queue read looks through. */
export const QUEUE_SCAN_CAP = 500;

export const queueLabels = { simulated: true, sources: [ISSUER_SOURCE], notice: CUSTODY_NOTICE };

export interface QueueQuery {
  status?: string | undefined;
  representationId?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

export interface QueueDeps {
  db: Db;
  chain: CustodyRepository;
  caller: Caller;
  subject: string;
  now: Date;
}

/** Merges per-representation scans into one newest-first page of `limit` with a cursor. */
export async function queue<T extends { id: number }>(
  deps: QueueDeps,
  query: QueueQuery,
  kind: string,
  fetchFor: (representationId: string) => (
    from: number,
    limit: number,
  ) => Promise<{
    items: T[];
    total: number;
  }>,
  keep: (item: T) => boolean,
): Promise<{ items: T[]; issuerIds: string[]; nextCursor: string | null }> {
  const { issuerIds, representationIds } = await readableRepresentations(
    deps.db,
    deps.chain,
    deps.caller,
    { operatorMayRead: true, only: query.representationId, subject: deps.subject },
  );
  const bound = { kind, status: query.status, representationId: query.representationId };
  const before = query.cursor === undefined ? undefined : decodeCursor(query.cursor, bound);
  const found: T[] = [];
  for (const id of representationIds) {
    const scan = await scanNewest(fetchFor(id), {
      want: query.limit + 1,
      cap: QUEUE_SCAN_CAP,
      before,
      keep,
    });
    found.push(...scan.items);
  }
  found.sort((a, b) => b.id - a.id);
  const items = found.slice(0, query.limit);
  const more = found.length > query.limit;
  const last = items.at(-1);
  return {
    items,
    issuerIds,
    nextCursor: more && last ? encodeCursor(last.id, bound) : null,
  };
}

export async function issuerRedemptionQueue(
  deps: QueueDeps,
  query: QueueQuery & { status?: RedemptionStatus | undefined },
): Promise<IssuerRedemptionList> {
  const page = await queue(
    deps,
    query,
    "redemptions",
    (rep) => (from, limit) => deps.chain.getRedemptionsByRepresentation(rep, from, limit),
    (r) => query.status === undefined || r.status === query.status,
  );
  return {
    items: page.items.map((r) => redemptionSummary(r, deps.now.getTime())),
    issuerIds: page.issuerIds,
    nextCursor: page.nextCursor,
    ...queueLabels,
  };
}
