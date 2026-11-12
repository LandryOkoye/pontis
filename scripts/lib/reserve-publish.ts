// The simulated custodian's pure part (ADR 0020 section 3): from a representation's real token
// supply, a cover ratio and the clock, the reserve attestation the dev reserve-attester key signs,
// in the exact arguments of `submit_reserve_attestation`. Every figure is labelled
// `simulated: true` / `simulated_custodian`: nothing is custodied, backed or audited, and this file
// never changes the label. The cover ratio state (what `drift` writes) is a small JSON file.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { devKey } from "@pontis/dev-keys";
import {
  submitReserveAttestationArgs,
  type ReserveAttestation,
  type SubmitReserveAttestationArgs,
} from "@pontis/market-data";
import { MAX_COVER_BPS } from "./reserve-ops.ts";

export const SIMULATED_CUSTODIAN_SOURCE = "simulated_custodian";
/** The contract's cap on one attestation (ADR 0020 section 3). */
export const MAX_RESERVED_UNITS = 1n << 100n;

/** A representation the simulated custodian attests for. */
export interface ReserveTarget {
  representationId: string;
  /** The token contract whose `ft_total_supply` is the supply to cover. */
  tokenId: string;
  custodianId: string;
}

export interface ReserveSubmission {
  representationId: string;
  custodianId: string;
  supply: bigint;
  coverBps: number;
  reservedUnits: bigint;
  args: SubmitReserveAttestationArgs;
}

/** `floor(supply * coverBps / 10000)`: what the simulated custodian claims to hold. */
export function reservedUnitsFor(supply: bigint, coverBps: number): bigint {
  if (supply < 0n) throw new RangeError("supply must not be negative");
  if (!Number.isInteger(coverBps) || coverBps < 0 || coverBps > MAX_COVER_BPS) {
    throw new RangeError(`cover must be an integer from 0 to ${MAX_COVER_BPS} bps`);
  }
  const reserved = (supply * BigInt(coverBps)) / 10_000n;
  if (reserved > MAX_RESERVED_UNITS) throw new RangeError("reserved units exceed 2^100");
  return reserved;
}

/** A strictly newer `as_of_ms` than the last one sent for the same pair, which the contract needs. */
export function nextAsOfMs(nowMs: number, lastMs: number | undefined): number {
  return lastMs === undefined ? nowMs : Math.max(nowMs, lastMs + 1);
}

/** The synthetic report: a text, its sha256 and the `sim://` URI. There is no real document. */
export function syntheticReport(
  representationId: string,
  custodianId: string,
  asOfMs: number,
  reservedUnits: bigint,
): { text: string; hash: string; uri: string } {
  const month = new Date(asOfMs).toISOString().slice(0, 7);
  const text = `SIMULATED reserve report: ${representationId}, ${custodianId}, as of ${asOfMs}, ${reservedUnits} units`;
  return {
    text,
    hash: createHash("sha256").update(text).digest("hex"),
    uri: `sim://reserves/${representationId}/${month}`,
  };
}

export function reserveAttestationFor(
  target: ReserveTarget,
  supply: bigint,
  coverBps: number,
  asOfMs: number,
  contract: string,
): ReserveAttestation {
  const reservedUnits = reservedUnitsFor(supply, coverBps);
  const report = syntheticReport(
    target.representationId,
    target.custodianId,
    asOfMs,
    reservedUnits,
  );
  return {
    contract,
    representationId: target.representationId,
    custodianId: target.custodianId,
    reservedUnits,
    asOfMs,
    reportHash: report.hash,
    reportUri: report.uri,
    simulated: true,
    source: SIMULATED_CUSTODIAN_SOURCE,
  };
}

/** One signed submission, with the dev reserve-attester key. */
export function reserveSubmission(
  target: ReserveTarget,
  supply: bigint,
  coverBps: number,
  asOfMs: number,
  contract: string,
): ReserveSubmission {
  const attestation = reserveAttestationFor(target, supply, coverBps, asOfMs, contract);
  return {
    representationId: target.representationId,
    custodianId: target.custodianId,
    supply,
    coverBps,
    reservedUnits: attestation.reservedUnits,
    args: submitReserveAttestationArgs(attestation, devKey("reserve-attester")),
  };
}

/** Per-representation cover ratios in basis points; absent means "use the `--cover-bps` default". */
export type CoverState = Record<string, number>;

export function coverFor(state: CoverState, representationId: string, fallbackBps: number): number {
  return state[representationId] ?? fallbackBps;
}

export function parseCoverState(source: string): CoverState {
  const parsed: unknown = JSON.parse(source);
  const entries =
    typeof parsed === "object" && parsed !== null && "cover_bps" in parsed
      ? Object.entries(parsed.cover_bps ?? {})
      : [];
  const state: CoverState = {};
  for (const [id, bps] of entries) {
    if (typeof bps !== "number" || !Number.isInteger(bps) || bps < 0 || bps > MAX_COVER_BPS) {
      throw new Error(
        `reserves state: cover for ${id} must be an integer from 0 to ${MAX_COVER_BPS}`,
      );
    }
    state[id] = bps;
  }
  return state;
}

export function serializeCoverState(state: CoverState): string {
  const sorted = Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ simulated: true, cover_bps: sorted }, null, 2)}\n`;
}

/** `scripts/.reserves-state.json` (git-ignored) unless `RESERVES_STATE_FILE` says otherwise. */
export function statePath(env: Record<string, string | undefined> = process.env): string {
  return (
    env.RESERVES_STATE_FILE?.trim() ||
    fileURLToPath(new URL("../.reserves-state.json", import.meta.url))
  );
}

/** A missing file is an empty state; a damaged one is an error, not a silent reset. */
export function loadCoverState(path: string): CoverState {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
  return parseCoverState(source);
}

export function saveCoverState(path: string, state: CoverState): void {
  writeFileSync(path, serializeCoverState(state));
}
