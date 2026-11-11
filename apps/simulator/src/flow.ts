// Simulated conversion flow between wrappers of one claim, so volume and activity are not empty.
// Deterministic per hour: the same hour always yields the same trades, so reruns insert nothing new.

import { Prng, seedFrom } from "@pontis/market-data";
import { FLOW_MAX_PER_HOUR } from "./supply-rich.ts";

export interface SimRep {
  id: string;
  claimId: string;
  decimals: number;
  /** Canonical units per smallest token unit, as in the registry. */
  multiplier: { num: bigint; den: bigint };
  /** Whole tokens in circulation at the start; trade sizes are a small share of it. */
  startSupplyTokens: bigint;
}

export interface SimTrade {
  ref: string;
  ts: Date;
  accountId: string;
  fromId: string;
  toId: string;
  amountIn: bigint;
  amountOut: bigint;
  fee: bigint;
}

const HOUR_MS = 3_600_000;
/** Most conversions in an hour for a claim not listed in the rich table: the draw is `below(4)`. */
const DEFAULT_MAX_PER_HOUR = 4;
/** The parity fee the contract charges by default: 10 bps, rounded up for the protocol. */
const FEE_BPS = 10n;

/** Parity output for `amountIn` of `from`, as the contract computes it: floor, then fee rounded up. */
export function parityOutput(from: SimRep, to: SimRep, amountIn: bigint) {
  const gross =
    (amountIn * from.multiplier.num * to.multiplier.den) /
    (from.multiplier.den * to.multiplier.num);
  const fee = (gross * FEE_BPS + 9_999n) / 10_000n;
  return { gross, fee, net: gross - fee };
}

/** Trades whose timestamps fall in the hours overlapping `[fromMs, toMs)`, clipped to that range. */
export function simulatedTrades(reps: readonly SimRep[], fromMs: number, toMs: number): SimTrade[] {
  const groups = new Map<string, SimRep[]>();
  for (const rep of reps) groups.set(rep.claimId, [...(groups.get(rep.claimId) ?? []), rep]);
  const out: SimTrade[] = [];
  for (const [claimId, group] of groups) {
    if (group.length < 2) continue;
    const maxPerHour = FLOW_MAX_PER_HOUR[claimId] ?? DEFAULT_MAX_PER_HOUR;
    for (let hour = Math.floor(fromMs / HOUR_MS); hour * HOUR_MS < toMs; hour++) {
      const rng = new Prng(seedFrom(`flow:${claimId}:${hour}`));
      const count = rng.below(maxPerHour);
      for (let n = 0; n < count; n++) {
        const ts = hour * HOUR_MS + rng.below(HOUR_MS);
        const from = group[rng.below(group.length)] as SimRep;
        const others = group.filter((r) => r.id !== from.id);
        const to = others[rng.below(others.length)] as SimRep;
        // Between 0.005% and 0.15% of the starting supply, at least one token.
        const share = BigInt(1 + rng.below(30));
        const tokens = (from.startSupplyTokens * share) / 20_000n || 1n;
        const amountIn = tokens * 10n ** BigInt(from.decimals);
        const { net, fee } = parityOutput(from, to, amountIn);
        const accountId = `sim-user-${rng.below(20)}.testnet`;
        if (ts < fromMs || ts >= toMs || net <= 0n) continue;
        out.push({
          ref: `sim:${from.id}:${to.id}:${ts}:${n}`,
          ts: new Date(ts),
          accountId,
          fromId: from.id,
          toId: to.id,
          amountIn,
          amountOut: net,
          fee,
        });
      }
    }
  }
  return out;
}
