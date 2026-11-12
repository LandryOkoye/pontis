// The reserve steps of the custody seed: a policy per linked representation and the first
// attestation of each story, signed by the simulated custodian (the dev reserve-attester key,
// domain pontis-reserve-v1) through the same `reserveSubmission` the `reserves publish` command
// uses. Every step reads chain state first. SIMULATED: nothing is custodied, backed or audited.
//
// The stories DECAY on purpose. A `stale` representation has a 5 minute max age and is not
// refreshed, so its route is refused a few minutes after the seed; every other story needs the
// simulated custodian (`reserves publish --loop`) to stay fresh once its max age (a day) passes.

import { admin, type Chain } from "./chain.ts";
import type { PlannedCustody } from "./catalogue-custody-types.ts";
import { relayerChain, tokenSupply } from "./reserve-chain.ts";
import {
  loadCoverState,
  nextAsOfMs,
  reserveSubmission,
  saveCoverState,
  statePath,
} from "./reserve-publish.ts";

interface StatusView {
  oldest_as_of_ms: number | null;
}

export interface ReserveSeedOptions {
  /** Account that submits the attestations (the signature is the authority); the deployer if absent. */
  relayer?: Chain;
  nowMs?: number;
  /** The simulated custodian's cover file; `reserves drift` writes the same one. */
  statePath?: string;
}

/** Representation ids the seed's stories need a looping publisher to leave alone (`--skip`). */
export function skippedByPublisher(rows: readonly PlannedCustody[]): string[] {
  return rows
    .filter((r) => r.story === "stale" || r.story === "never_attested")
    .map((r) => r.representationId);
}

/**
 * Whether the seed attests now: never for a representation that must stay unattested, always for one
 * with no attestation, and again (except the stale story) once half the max age has passed.
 */
export function needsAttestation(
  row: PlannedCustody,
  oldestAsOfMs: number | null,
  nowMs: number,
): boolean {
  if (row.coverBps === null) return false;
  if (oldestAsOfMs === null) return true;
  return row.story !== "stale" && nowMs - oldestAsOfMs > row.policy.maxReserveAgeMs / 2;
}

/** Attests for every row that needs it, at the story's cover; records the cover for a later `publish`. */
export async function seedAttestations(
  chain: Chain,
  rows: readonly PlannedCustody[],
  accountOf: (representationId: string) => string,
  options: ReserveSeedOptions = {},
): Promise<void> {
  const { coreId } = chain.config;
  const relayer = options.relayer ?? relayerChain(chain);
  const nowMs = options.nowMs ?? Date.now();
  const path = options.statePath ?? statePath();
  const state = loadCoverState(path);
  for (const row of rows) {
    if (row.coverBps === null) continue;
    const id = row.representationId;
    state[id] = row.coverBps;
    const status = await chain.view<StatusView>(coreId, "get_reserve_status", {
      representation_id: id,
    });
    if (!needsAttestation(row, status?.oldest_as_of_ms ?? null, nowMs)) continue;
    const latest = await chain.view<{ as_of_ms: number } | null>(
      coreId,
      "get_reserve_attestation",
      {
        representation_id: id,
        custodian_id: row.custodianId,
      },
    );
    const token = accountOf(id);
    const supply = await tokenSupply(chain.view.bind(chain), token);
    const target = { representationId: id, tokenId: token, custodianId: row.custodianId };
    const s = reserveSubmission(
      target,
      supply,
      row.coverBps,
      nextAsOfMs(nowMs, latest?.as_of_ms),
      coreId,
    );
    await admin(relayer, coreId, "submit_reserve_attestation", s.args);
    console.log(
      `${id}/${row.custodianId}: attested ${s.reservedUnits} units for supply ${s.supply} at ${row.coverBps} bps cover (SIMULATED)`,
    );
  }
  saveCoverState(path, state);
}
