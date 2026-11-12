// Fills in what events do not carry by reading the chain views: custodian details, issuer
// reliability counters, a snapshot of the reserve status and the state of open mint requests. Each row is marked when an event makes
// it stale (see apply.ts); a failed read leaves the mark, so the next pass tries again.

import { custodians, issuerReliability, mintRequests, reserveStatus, type Db } from "@pontis/db";
import { eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { MirrorChain } from "../chain-views.ts";
import type { Logger } from "../indexer.ts";

export interface RefreshResult {
  custodians: number;
  issuers: number;
  reserveStatuses: number;
  /** Mint requests whose status moved on chain without (or ahead of) an event. */
  mintRequests: number;
}

export interface RefreshOptions {
  db: Db;
  chain: MirrorChain;
  log: Logger;
  now?: () => Date;
}

/** Reads the chain for every row an event has marked stale; failures are logged, never thrown. */
export async function refreshMirrors(options: RefreshOptions): Promise<RefreshResult> {
  const { db, chain, log } = options;
  const now = (options.now ?? (() => new Date()))();
  const result: RefreshResult = { custodians: 0, issuers: 0, reserveStatuses: 0, mintRequests: 0 };

  for (const { id } of await db
    .select({ id: custodians.id })
    .from(custodians)
    .where(eq(custodians.needsRefresh, true))) {
    try {
      const onChain = await chain.custodian(id);
      if (!onChain) {
        // Not retried every pass: the row keeps the details its events gave, and the mark is cleared.
        log.error("custodian not found on chain; its details stay unknown", { custodian: id });
        await db
          .update(custodians)
          .set({ needsRefresh: false, refreshedAt: now })
          .where(eq(custodians.id, id));
        continue;
      }
      await db
        .update(custodians)
        .set({
          name: onChain.name,
          jurisdiction: onChain.jurisdiction,
          attesterKey: onChain.attester_key,
          status: onChain.status,
          synthetic: onChain.synthetic,
          verificationStatus: onChain.verification_status,
          evidence: onChain.evidence,
          registeredBy: onChain.registered_by,
          registeredAt: new Date(onChain.registered_at_ms),
          needsRefresh: false,
          refreshedAt: now,
        })
        .where(eq(custodians.id, id));
      result.custodians++;
    } catch (error) {
      log.error("custodian refresh failed; will retry", { custodian: id, error: String(error) });
    }
  }

  for (const { issuerId } of await db
    .select({ issuerId: issuerReliability.issuerId })
    .from(issuerReliability)
    .where(eq(issuerReliability.needsRefresh, true))) {
    try {
      const r = await chain.issuerReliability(issuerId);
      await db
        .update(issuerReliability)
        .set({
          requested: r.requested,
          accepted: r.accepted,
          fulfilled: r.fulfilled,
          rejected: r.rejected,
          expired: r.expired,
          acceptMisses: r.accept_misses,
          fulfilMisses: r.fulfil_misses,
          reclaimed: r.reclaimed,
          acceptLatencyMsTotal: r.accept_latency_ms_total,
          settleLatencyMsTotal: r.settle_latency_ms_total,
          lastMissAt: r.last_miss_ms === null ? null : new Date(r.last_miss_ms),
          simulated: r.simulated,
          needsRefresh: false,
          refreshedAt: now,
        })
        .where(eq(issuerReliability.issuerId, issuerId));
      result.issuers++;
    } catch (error) {
      log.error("issuer reliability refresh failed; will retry", {
        issuer: issuerId,
        error: String(error),
      });
    }
  }

  for (const { representationId } of await db
    .select({ representationId: reserveStatus.representationId })
    .from(reserveStatus)
    .where(
      or(
        isNull(reserveStatus.chainRefreshedAt),
        lt(reserveStatus.chainRefreshedAt, reserveStatus.changedAt),
      ),
    )) {
    try {
      const status = await chain.reserveStatus(representationId);
      await db
        .update(reserveStatus)
        .set({
          chainStatus: status,
          chainRefreshedAt: now,
          simulated: status.simulated,
          sources: status.sources,
        })
        .where(eq(reserveStatus.representationId, representationId));
      result.reserveStatuses++;
    } catch (error) {
      log.error("reserve status refresh failed; will retry", {
        representation: representationId,
        error: String(error),
      });
    }
  }

  // `execute_mint` emits no event, so `minting` is visible only here, and a `mint_completed` or
  // `mint_failed` the indexer has not read yet is closed from the chain's record. The chain is
  // the authority; the events later apply the same terminal state.
  for (const open of await db
    .select({ id: mintRequests.id, status: mintRequests.status })
    .from(mintRequests)
    .where(inArray(mintRequests.status, ["requested", "minting"]))) {
    try {
      const onChain = await chain.mintRequest(open.id);
      if (!onChain || onChain.status === open.status) continue;
      await db
        .update(mintRequests)
        .set({
          status: onChain.status,
          resolvedAt: onChain.resolved_ms === null ? null : new Date(onChain.resolved_ms),
          failure: onChain.failure,
        })
        .where(eq(mintRequests.id, open.id));
      result.mintRequests++;
    } catch (error) {
      log.error("mint request refresh failed; will retry", {
        mintRequest: open.id,
        error: String(error),
      });
    }
  }
  return result;
}
