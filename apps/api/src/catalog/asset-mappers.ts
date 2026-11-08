// Representation rows to `AssetSummary` and `Asset`.

import type { Asset, AssetSummary } from "@pontis/api-types";
import {
  canonicalAsset,
  evidence,
  flags,
  isoOrNull,
  issuerSummary,
  type ClaimRow,
  type EvidenceRow,
  type IssuerRow,
  type RepresentationRow,
} from "./mappers.ts";

const multiplier = (r: RepresentationRow) => ({
  num: r.unitMultiplierNum,
  den: r.unitMultiplierDen,
});

export const assetSummary = (
  r: RepresentationRow,
  claim: ClaimRow,
  i: IssuerRow,
): AssetSummary => ({
  id: r.id,
  symbol: r.symbol,
  name: r.name,
  network: "near-testnet",
  accountId: r.accountId,
  decimals: r.decimals,
  unitMultiplier: multiplier(r),
  status: r.status,
  canonicalAssetId: claim.id,
  canonicalAssetName: claim.name,
  issuer: issuerSummary(i),
  ...flags(r),
});

export const asset = (
  r: RepresentationRow,
  claim: ClaimRow,
  i: IssuerRow,
  ev: EvidenceRow[],
): Asset => ({
  id: r.id,
  canonicalAsset: canonicalAsset(claim),
  issuer: issuerSummary(i),
  network: "near-testnet",
  accountId: r.accountId,
  standard: "NEP-141",
  name: r.name,
  symbol: r.symbol,
  decimals: r.decimals,
  unitMultiplier: multiplier(r),
  adminCapabilities: r.adminCapabilities,
  custodyDescription: r.custodyDescription,
  redemptionMechanism: r.redemptionMechanism,
  transferPolicySummary: r.transferPolicySummary,
  bridgeStatus: r.bridgeStatus,
  allowlistRequired: r.allowlistRequired,
  status: r.status,
  lastReviewedAt: isoOrNull(r.lastReviewedAt),
  evidence: evidence(ev),
  vaultInventory: r.vaultInventory,
  ...flags(r),
});
