// Custody, reserve, redemption-terms and reliability reads (ADR 0020 section 10). Each endpoint
// reads the contract's views on every request: the reserve status in particular is computed by the
// contract from signed attestations and its own supply counters, and this file only reshapes it.
// Labels (`simulated`, `sources`) pass through from the signers and are never upgraded.

import type {
  AssetCustody,
  AssetRedemptionTerms,
  AssetReserves,
  Custodian,
  CustodianList,
  IssuerReliability,
  ReserveAttestation,
  ReserveHistory,
} from "@pontis/api-types";
import {
  formatBpsPercent,
  nextRedemptionWindowMs,
  redemptionWindowOpen,
  type ReserveState,
} from "@pontis/domain";
import { assetRepresentations, canonicalAssets, issuers, type Db } from "@pontis/db";
import type { ChainCustodian, ChainReserveRecord, ChainReserveStatus } from "@pontis/near-client";
import { eq } from "drizzle-orm";
import { notFound } from "../errors.ts";
import { decodeCursor, encodeCursor } from "../market/cursor.ts";
import type { CustodyRepository } from "./chain.ts";
import { CUSTODY_NOTICE, ISSUER_SOURCE, REGISTRAR_SOURCE, iso, isoOrNull } from "./labels.ts";
import { newestFirst } from "./paging.ts";

export interface PageRequest {
  limit: number;
  cursor?: string | undefined;
}

/** The mirror says which asset exists and who issues it; everything else is the chain's. */
export async function requireRepresentation(db: Db, id: string) {
  const [row] = await db
    .select({
      id: assetRepresentations.id,
      issuerId: assetRepresentations.issuerId,
      canonicalAssetId: assetRepresentations.canonicalAssetId,
    })
    .from(assetRepresentations)
    .where(eq(assetRepresentations.id, id));
  if (!row) throw notFound(`Asset ${id}`);
  return row;
}

const registrarLabels = {
  simulated: true,
  sources: [REGISTRAR_SOURCE],
  notice: CUSTODY_NOTICE,
};

export function custodianView(c: ChainCustodian): Custodian {
  return {
    id: c.id,
    name: c.name,
    jurisdiction: c.jurisdiction,
    attesterKey: c.attester_key,
    status: c.status,
    synthetic: c.synthetic,
    verificationStatus: c.verification_status,
    evidence: c.evidence.map((e) => ({
      uri: e.uri,
      sha256: e.sha256,
      provenance: e.provenance,
      description: e.description,
      addedBy: e.added_by,
      addedAt: iso(e.timestamp_ms),
    })),
    registeredBy: c.registered_by,
    registeredAt: iso(c.registered_at_ms),
    ...registrarLabels,
  };
}

export async function listCustodians(
  chain: CustodyRepository,
  page: PageRequest,
): Promise<CustodianList> {
  // A registry reads best in registration order, which is how the contract keeps it.
  const query = { kind: "custodians" };
  const from = page.cursor === undefined ? 0 : decodeCursor(page.cursor, query);
  const result = await chain.getCustodians(from, page.limit);
  const next = from + result.items.length;
  return {
    items: result.items.map(custodianView),
    total: result.total,
    nextCursor: next < result.total && result.items.length > 0 ? encodeCursor(next, query) : null,
    ...registrarLabels,
  };
}

export async function getCustodian(chain: CustodyRepository, id: string): Promise<Custodian> {
  const custodian = await chain.getCustodian(id);
  if (!custodian) throw notFound(`Custodian ${id}`);
  return custodianView(custodian);
}

export async function assetCustody(
  db: Db,
  chain: CustodyRepository,
  id: string,
): Promise<AssetCustody> {
  await requireRepresentation(db, id);
  const link = await chain.getCustodyLink(id);
  if (!link) {
    return {
      assetId: id,
      linked: false,
      structure: null,
      custodians: [],
      linkedBy: null,
      linkedAt: null,
      ...registrarLabels,
    };
  }
  const custodians = await Promise.all(link.custodian_ids.map((c) => chain.getCustodian(c)));
  return {
    assetId: id,
    linked: true,
    structure: link.structure,
    custodians: custodians.flatMap((c) => (c ? [custodianView(c)] : [])),
    linkedBy: link.linked_by,
    linkedAt: iso(link.linked_at_ms),
    ...registrarLabels,
  };
}

const EXPLANATIONS: Record<ReserveState, string> = {
  ok: "The simulated custodian's latest signed figures cover the supply the contract tracks. This is a simulation: nothing is held, backed or audited.",
  breached:
    "The supply the contract tracks is above the attested reserves plus the allowed tolerance. The figures are simulated.",
  stale:
    "The oldest reserve attestation is older than this asset's policy allows, so the reserve figure is no longer current.",
  no_attestation:
    "No active custodian linked to this asset has attested reserves yet, so there is no reserve figure.",
  unmonitored:
    "This asset has no reserve policy: nothing is enforced and no reserve figure is monitored.",
};

export function reserveExplanation(status: ChainReserveStatus): string {
  const base = EXPLANATIONS[status.state];
  if (status.restricts_conversions)
    return `${base} Conversions of this asset are refused while this holds.`;
  if (status.mint_paused) return `${base} Minting through the gate is paused while this holds.`;
  return base;
}

function attestationView(r: ChainReserveRecord): ReserveAttestation {
  return {
    seq: r.seq,
    custodianId: r.custodian_id,
    reservedUnits: r.reserved_units,
    asOf: iso(r.as_of_ms),
    submittedAt: iso(r.submitted_ms),
    reportUri: r.report_uri,
    reportHash: r.report_hash,
    attesterKey: r.attester_key,
    simulated: r.simulated,
    source: r.source,
  };
}

export async function assetReserves(
  db: Db,
  chain: CustodyRepository,
  id: string,
  now: Date,
): Promise<AssetReserves> {
  await requireRepresentation(db, id);
  const [status, link, latest] = await Promise.all([
    chain.getReserveStatus(id),
    chain.getCustodyLink(id),
    chain.getReserveAttestations(id),
  ]);
  const custodians = await Promise.all(
    (link?.custodian_ids ?? []).map((c) => chain.getCustodian(c)),
  );
  const lines = custodians.flatMap((c) => {
    if (!c) return [];
    const record = latest.find((r) => r.custodian_id === c.id);
    const ageMs = record ? Math.max(0, now.getTime() - record.as_of_ms) : 0;
    return [
      {
        custodianId: c.id,
        custodianName: c.name,
        custodianStatus: c.status,
        counted: c.status === "active" && record !== undefined,
        latest: record
          ? {
              ...attestationView(record),
              ageMs,
              fresh: status.monitored && ageMs <= status.max_reserve_age_ms,
            }
          : null,
      },
    ];
  });
  const policy =
    status.monitored && status.action
      ? {
          action: status.action,
          toleranceBps: status.tolerance_bps,
          maxReserveAgeMs: status.max_reserve_age_ms,
        }
      : null;
  return {
    assetId: id,
    monitored: status.monitored,
    state: status.state,
    policy,
    attestedUnits: status.attested_units,
    limitUnits: status.limit_units,
    circulatingUnits: status.circulating_units,
    headroomUnits: status.headroom_units,
    ratioBps: status.ratio_bps,
    ratioPercent: status.ratio_bps === null ? null : formatBpsPercent(status.ratio_bps),
    freshness:
      !status.monitored || status.age_ms === null
        ? "none"
        : status.age_ms > status.max_reserve_age_ms
          ? "stale"
          : "fresh",
    oldestAsOf: isoOrNull(status.oldest_as_of_ms),
    ageMs: status.age_ms,
    supplyReadAt: isoOrNull(status.supply_read_ms),
    restrictsConversions: status.restricts_conversions,
    mintPaused: status.mint_paused,
    custodians: lines,
    explanation: reserveExplanation(status),
    // The chain ORs the flag over the attestations that count; with none, the label stays simulated.
    simulated: status.simulated || status.sources.length === 0,
    sources: status.sources,
    notice: CUSTODY_NOTICE,
  };
}

/** The chain keeps the last 500 attestations per asset (ADR 0020 section 3). */
const HISTORY_RING = 500;

export async function reserveHistory(
  db: Db,
  chain: CustodyRepository,
  id: string,
  page: PageRequest,
): Promise<ReserveHistory> {
  await requireRepresentation(db, id);
  const result = await newestFirst((from, limit) => chain.getReserveHistory(id, from, limit), {
    ...page,
    query: { kind: "reserve-history", id },
    floor: (total) => Math.max(0, total - HISTORY_RING),
  });
  const items = result.items.map(attestationView);
  return {
    assetId: id,
    items,
    total: result.total,
    nextCursor: result.nextCursor,
    simulated: items.every((i) => i.simulated),
    sources: [...new Set(items.map((i) => i.source))],
    notice: CUSTODY_NOTICE,
  };
}

export async function assetRedemptionTerms(
  db: Db,
  chain: CustodyRepository,
  id: string,
  now: Date,
): Promise<AssetRedemptionTerms> {
  const rep = await requireRepresentation(db, id);
  const [asset] = await db
    .select({ redemptionTerms: canonicalAssets.redemptionTerms })
    .from(canonicalAssets)
    .where(eq(canonicalAssets.id, rep.canonicalAssetId));
  const stored = await chain.getRedemptionTerms(id);
  const base = {
    assetId: id,
    description: asset?.redemptionTerms ?? "",
    simulated: true,
    sources: [REGISTRAR_SOURCE],
    notice: CUSTODY_NOTICE,
  };
  if (!stored) {
    return { ...base, terms: null, version: null, termsHash: null, setBy: null, setAt: null };
  }
  const t = stored.terms;
  const window = {
    anchorMs: t.window_anchor_ms,
    lengthMs: t.window_length_ms,
    periodMs: t.window_period_ms,
  };
  const nextOpen = nextRedemptionWindowMs(window, now.getTime());
  return {
    ...base,
    terms: {
      minAmount: t.min_amount,
      maxAmount: t.max_amount === "0" ? null : t.max_amount,
      feeBps: t.fee_bps,
      window: {
        alwaysOpen: t.window_period_ms === 0,
        anchorAt: t.window_period_ms === 0 ? null : iso(t.window_anchor_ms),
        lengthMs: t.window_length_ms,
        periodMs: t.window_period_ms,
        open: redemptionWindowOpen(window, now.getTime()),
        nextOpenAt: nextOpen === null ? null : iso(nextOpen),
      },
      acceptWithinMs: t.accept_within_ms,
      settlementDays: t.settlement_days,
    },
    version: stored.version,
    termsHash: stored.terms_hash,
    setBy: stored.set_by,
    setAt: iso(stored.set_ms),
  };
}

const rate = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.floor((part * 10_000) / whole);
const average = (total: string, count: number): number | null =>
  count === 0 ? null : Number(BigInt(total) / BigInt(count));

export async function issuerReliability(
  db: Db,
  chain: CustodyRepository,
  id: string,
): Promise<IssuerReliability> {
  const [issuer] = await db.select({ id: issuers.id }).from(issuers).where(eq(issuers.id, id));
  if (!issuer) throw notFound(`Issuer ${id}`);
  const r = await chain.getIssuerReliability(id);
  return {
    issuerId: id,
    requested: r.requested,
    accepted: r.accepted,
    fulfilled: r.fulfilled,
    rejected: r.rejected,
    expired: r.expired,
    acceptMisses: r.accept_misses,
    fulfilMisses: r.fulfil_misses,
    reclaimed: r.reclaimed,
    lastMissAt: isoOrNull(r.last_miss_ms),
    score: {
      fulfilmentRateBps: rate(r.fulfilled, r.requested),
      acceptMissRateBps: rate(r.accept_misses, r.requested),
      fulfilMissRateBps: rate(r.fulfil_misses, r.accepted),
      avgAcceptLatencyMs: average(r.accept_latency_ms_total, r.accepted),
      avgSettleLatencyMs: average(r.settle_latency_ms_total, r.fulfilled),
    },
    // Every issuer in the demo is a simulator, whatever the counters' own flag says.
    simulated: true,
    sources: [ISSUER_SOURCE],
    notice: CUSTODY_NOTICE,
  };
}
