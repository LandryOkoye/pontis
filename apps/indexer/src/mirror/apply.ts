// Applies custody, reserve, mint, redemption and signer-key events to their mirror tables. The
// caller runs this only for an event it has just stored in `settlement_events`, so a replayed block
// changes nothing; tables that keep one row per event also carry the `(receipt_id, log_index)` key.

import {
  auditLog,
  custodians,
  custodyLinks,
  reserveAttestations,
  reservePolicies,
  reserveStatus,
  reserveSupplyReads,
  signerKeys,
  type DbTx,
} from "@pontis/db";
import { and, eq } from "drizzle-orm";
import type { CoreExecution } from "../chain-source.ts";
import type { CoreEvent } from "../events.ts";
import { parseMirrorEvent, type MirrorEvent } from "./events.ts";
import { applyMintOrRedemption } from "./apply-redemption.ts";
import { date, type Where } from "./where.ts";

async function applyOne(w: Where, event: MirrorEvent): Promise<void> {
  const { tx } = w;
  switch (event.name) {
    case "signer_key_added": {
      const d = event.data;
      const row = {
        role: d.role,
        publicKey: d.public_key,
        accountId: d.account_id,
        scopes: d.scopes,
        addedBy: d.by,
        addedAt: date(d.timestamp_ms),
        removedBy: null,
        removedAt: null,
      };
      await tx
        .insert(signerKeys)
        .values(row)
        .onConflictDoUpdate({ target: [signerKeys.role, signerKeys.publicKey], set: row });
      return;
    }
    case "signer_key_removed": {
      const d = event.data;
      await tx
        .update(signerKeys)
        .set({ removedBy: d.by, removedAt: date(d.timestamp_ms) })
        .where(and(eq(signerKeys.role, d.role), eq(signerKeys.publicKey, d.public_key)));
      return;
    }
    case "custodian_registered": {
      const d = event.data;
      const at = date(d.timestamp_ms);
      await tx
        .insert(custodians)
        .values({
          id: d.id,
          attesterKey: d.attester_key,
          status: "active",
          registeredBy: d.by,
          registeredAt: at,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: custodians.id,
          set: {
            attesterKey: d.attester_key,
            registeredBy: d.by,
            registeredAt: at,
            updatedAt: at,
            needsRefresh: true,
          },
        });
      return;
    }
    case "custodian_status_changed": {
      const d = event.data;
      const at = date(d.timestamp_ms);
      const moved = await tx
        .update(custodians)
        .set({ status: d.to, updatedAt: at })
        .where(eq(custodians.id, d.id))
        .returning({ id: custodians.id });
      // Registered before the indexer's first block: a row whose details the refresh fills in.
      if (moved.length === 0)
        await tx.insert(custodians).values({
          id: d.id,
          attesterKey: "",
          status: d.to,
          registeredBy: d.by,
          registeredAt: at,
          updatedAt: at,
        });
      return;
    }
    case "custodian_key_set": {
      const d = event.data;
      const at = date(d.timestamp_ms);
      const moved = await tx
        .update(custodians)
        .set({ attesterKey: d.attester_key, updatedAt: at })
        .where(eq(custodians.id, d.id))
        .returning({ id: custodians.id });
      if (moved.length === 0)
        await tx.insert(custodians).values({
          id: d.id,
          attesterKey: d.attester_key,
          status: "active",
          registeredBy: d.by,
          registeredAt: at,
          updatedAt: at,
        });
      return;
    }
    case "custody_linked": {
      const d = event.data;
      const row = {
        representationId: d.representation_id,
        structure: d.structure,
        custodianIds: d.custodian_ids,
        linkedBy: d.by,
        linkedAt: date(d.timestamp_ms),
      };
      await tx
        .insert(custodyLinks)
        .values(row)
        .onConflictDoUpdate({ target: custodyLinks.representationId, set: row });
      return;
    }
    case "reserve_attested": {
      const d = event.data;
      await tx
        .insert(reserveAttestations)
        .values({
          receiptId: w.receiptId,
          logIndex: w.logIndex,
          blockHeight: w.blockHeight,
          representationId: d.representation_id,
          custodianId: d.custodian_id,
          reservedUnits: d.reserved_units,
          asOf: date(d.as_of_ms),
          reportHash: d.report_hash,
          reportUri: d.report_uri,
          simulated: d.simulated,
          source: d.source,
          attesterKey: d.attester_key,
          seq: d.seq,
          submittedAt: date(d.timestamp_ms),
        })
        .onConflictDoNothing();
      return;
    }
    case "reserve_policy_set": {
      const d = event.data;
      const row = {
        representationId: d.representation_id,
        toleranceBps: d.policy.tolerance_bps,
        maxReserveAgeMs: d.policy.max_reserve_age_ms,
        action: d.policy.action,
        baselineSupply: d.policy.baseline_supply,
        setBy: d.by,
        setAt: date(d.timestamp_ms),
      };
      await tx
        .insert(reservePolicies)
        .values(row)
        .onConflictDoUpdate({ target: reservePolicies.representationId, set: row });
      return;
    }
    case "reserve_supply_read": {
      const d = event.data;
      await tx
        .insert(reserveSupplyReads)
        .values({
          receiptId: w.receiptId,
          logIndex: w.logIndex,
          blockHeight: w.blockHeight,
          representationId: d.representation_id,
          supply: d.supply,
          readAt: date(d.timestamp_ms),
        })
        .onConflictDoNothing();
      return;
    }
    case "reserve_status_changed": {
      const d = event.data;
      const row = {
        representationId: d.representation_id,
        state: d.to_state,
        action: d.action,
        attestedUnits: d.attested_units,
        circulatingUnits: d.circulating_units,
        ratioBps: d.ratio_bps,
        changedAt: date(d.timestamp_ms),
      };
      await tx
        .insert(reserveStatus)
        .values(row)
        .onConflictDoUpdate({ target: reserveStatus.representationId, set: row });
      return;
    }
    default:
      return applyMintOrRedemption(w, event);
  }
}

/**
 * Applies `event` to the mirror tables. A known event whose payload does not match is left in
 * `settlement_events`, noted in the audit log, and skipped, so one bad payload cannot stall the
 * indexer or write a guess into the mirror.
 */
export async function applyMirrorEvent(
  tx: DbTx,
  execution: CoreExecution,
  event: CoreEvent,
): Promise<void> {
  const parsed = parseMirrorEvent(event);
  if (parsed.kind === "other") return;
  if (parsed.kind === "invalid") {
    await tx.insert(auditLog).values({
      actor: "indexer",
      action: "mirror.event_unreadable",
      subject: parsed.name,
      detail: {
        problem: parsed.problem,
        receiptId: execution.receiptId,
        logIndex: event.logIndex,
      },
    });
    return;
  }
  await applyOne(
    {
      tx,
      receiptId: execution.receiptId,
      logIndex: event.logIndex,
      blockHeight: execution.blockHeight,
    },
    parsed.event,
  );
}
