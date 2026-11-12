// GET /v1/assets/{id}/lifecycle, /corporate-actions and /nav (ADR 0017, ADR 0018): the contract's
// records, read live and reshaped for the wire. The mirror only says which asset exists and which
// wrappers share its claim; every fact about an action, a stage or a strike is the chain's, and the
// labels it carries (`provenance`, `simulated`, `source`) pass through unchanged.

import type {
  AssetLifecycle,
  AssetNav,
  CorporateAction,
  CorporateActionList,
  NavStrike,
} from "@pontis/api-types";
import { formatPrice } from "@pontis/domain";
import { assetRepresentations, type Db } from "@pontis/db";
import type { ChainCorporateAction, ChainNavStrike } from "@pontis/near-client";
import { eq } from "drizzle-orm";
import { notFound } from "../errors.ts";
import type { ActionsChain } from "./chain.ts";

const iso = (ms: number): string => new Date(ms).toISOString();

async function requireAsset(db: Db, id: string) {
  const [row] = await db
    .select({
      id: assetRepresentations.id,
      canonicalAssetId: assetRepresentations.canonicalAssetId,
    })
    .from(assetRepresentations)
    .where(eq(assetRepresentations.id, id));
  if (!row) throw notFound(`Asset ${id}`);
  return row;
}

export async function assetLifecycle(
  db: Db,
  chain: ActionsChain,
  id: string,
): Promise<AssetLifecycle> {
  await requireAsset(db, id);
  const life = await chain.getLifecycle(id);
  if (!life) throw notFound(`Asset ${id}`);
  return {
    assetId: id,
    kind: life.kind,
    stage: life.stage,
    noConversion: life.no_conversion,
    bridgeOnly: life.bridge_only,
    history: life.history.map((h) => ({
      from: h.from,
      to: h.to,
      by: h.by,
      at: iso(h.at_ms),
      evidenceHash: h.evidence_hash,
      note: h.note,
    })),
    delistRequest: life.delist_request && {
      by: life.delist_request.by,
      at: iso(life.delist_request.at_ms),
      evidenceHash: life.delist_request.evidence_hash,
      note: life.delist_request.note,
    },
  };
}

interface Wrapper {
  id: string;
  live: boolean;
}

function actionView(a: ChainCorporateAction, wrappers: Wrapper[], now: Date): CorporateAction {
  return {
    id: a.id,
    canonicalAssetId: a.asset_id,
    kind: a.kind,
    status: a.status,
    announcedAt: iso(a.announced_at_ms),
    exDate: iso(a.ex_date_ms),
    effectiveAt: iso(a.effective_ms),
    freezeFrom: iso(a.freeze_from_ms),
    freezeUntil: iso(a.freeze_until_ms),
    // The contract's own rule: only an approved action freezes, over [from, until).
    freezeActive:
      a.status === "approved" &&
      a.freeze_from_ms <= now.getTime() &&
      now.getTime() < a.freeze_until_ms,
    multiplierChange: a.multiplier_change,
    evidence: a.evidence.map((e) => ({
      uri: e.uri,
      sha256: e.sha256,
      provenance: e.provenance,
      description: e.description,
      addedBy: e.added_by,
      addedAt: iso(e.timestamp_ms),
    })),
    proposedBy: a.proposed_by,
    approvedBy: a.approved_by,
    wrappers: wrappers.map((w) => ({
      representationId: w.id,
      live: w.live,
      applied: a.applied_representations.includes(w.id),
    })),
    history: a.history.map((h) => ({ status: h.status, by: h.by, at: iso(h.at_ms), note: h.note })),
  };
}

export async function assetCorporateActions(
  db: Db,
  chain: ActionsChain,
  id: string,
  now: Date,
): Promise<CorporateActionList> {
  const { canonicalAssetId } = await requireAsset(db, id);
  const reps = await db
    .select({ id: assetRepresentations.id, status: assetRepresentations.status })
    .from(assetRepresentations)
    .where(eq(assetRepresentations.canonicalAssetId, canonicalAssetId))
    .orderBy(assetRepresentations.id);
  // The contract's rule: a rejected or deprecated wrapper does not have to apply an action.
  const wrappers = reps.map((r) => ({
    id: r.id,
    live: r.status !== "rejected" && r.status !== "deprecated",
  }));
  const actions = await chain.getCorporateActions(canonicalAssetId);
  const multiplierEpochs = [];
  for (const w of wrappers) {
    const epochs = await chain.getMultiplierEpochs(w.id);
    multiplierEpochs.push({
      representationId: w.id,
      epochs: epochs.map((e) => {
        const genesis = e.action_id === "genesis";
        return {
          effectiveAt: genesis ? null : iso(e.effective_ms),
          multiplier: e.multiplier,
          actionId: genesis ? null : e.action_id,
        };
      }),
    });
  }
  return {
    assetId: id,
    canonicalAssetId,
    items: actions.map((a) => actionView(a, wrappers, now)),
    multiplierEpochs,
  };
}

function strikeView(s: ChainNavStrike, now: Date): NavStrike {
  const t = now.getTime();
  return {
    navPerUnit: formatPrice(BigInt(s.nav_per_unit)),
    currency: s.currency,
    asOf: iso(s.as_of_ms),
    cutoff: iso(s.cutoff_ms),
    submittedAt: iso(s.submitted_ms),
    source: s.source,
    simulated: s.simulated,
    publisherKey: s.publisher_key,
    // The contract's window: `[as_of_ms, cutoff_ms)`.
    windowState: t < s.as_of_ms ? "upcoming" : t < s.cutoff_ms ? "open" : "closed",
  };
}

export async function assetNav(
  db: Db,
  chain: ActionsChain,
  id: string,
  now: Date,
): Promise<AssetNav> {
  await requireAsset(db, id);
  const life = await chain.getLifecycle(id);
  if (!life) throw notFound(`Asset ${id}`);
  const strike = life.kind === "nav_fund" ? await chain.getNavStrike(id) : null;
  return { assetId: id, kind: life.kind, strike: strike && strikeView(strike, now) };
}
