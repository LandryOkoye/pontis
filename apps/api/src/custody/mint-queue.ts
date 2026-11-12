// GET /v1/issuer/mint-requests (ADR 0020 section 10): the issuer's gated mints, read from the chain.

import type { MintRequest, MintRequestList } from "@pontis/api-types";
import type { MintRequestStatus } from "@pontis/domain";
import type { ChainMintRequest } from "@pontis/near-client";
import { queue, queueLabels, type QueueDeps, type QueueQuery } from "./issuer-queue.ts";
import { iso, isoOrNull } from "./labels.ts";

export function mintRequestView(r: ChainMintRequest): MintRequest {
  return {
    id: String(r.id),
    assetId: r.representation_id,
    recipient: r.recipient,
    amount: r.amount,
    reference: r.reference,
    status: r.status,
    requestedBy: r.requested_by,
    requestedAt: iso(r.requested_ms),
    resolvedAt: isoOrNull(r.resolved_ms),
    failure: r.failure,
    ...queueLabels,
  };
}

export async function issuerMintQueue(
  deps: QueueDeps,
  query: QueueQuery & { status?: MintRequestStatus | undefined },
): Promise<MintRequestList> {
  const page = await queue(
    deps,
    query,
    "mint-requests",
    (rep) => (from, limit) => deps.chain.getMintRequests(rep, from, limit),
    (r) => query.status === undefined || r.status === query.status,
  );
  return {
    items: page.items.map(mintRequestView),
    issuerIds: page.issuerIds,
    nextCursor: page.nextCursor,
    ...queueLabels,
  };
}
