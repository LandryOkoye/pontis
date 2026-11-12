// The building blocks of the simulated feed (ADR 0015 section 5): a claim's base series and a
// representation's premium series. Integer math only; rates are integer parts per million or
// billion per step. Step `k` of a series is always the same value for the same profile.

import { parsePrice } from "@pontis/domain";
import { Prng, Q16, seedFrom } from "./prng.ts";

/** The feed's native grid. Every series has one point per step. */
export const STEP_MS = 300_000;
/** Every series starts here, so a given time always has the same price. */
export const SIM_ANCHOR_MS = Date.UTC(2026, 6, 1);

export const PPM = 1_000_000n;
const PPB = 1_000_000_000n;

export interface Jump {
  atMs: number;
  /** The base price is multiplied by `num / den` at this time. */
  num: bigint;
  den: bigint;
  /** Why, for the dossier and for tests; for example `split 4:1`. */
  reason: string;
}

export interface ClaimProfile {
  seed: string;
  /** Base price per canonical unit, decimal string at up to 8 places. */
  startPrice: string;
  /** Random walk drift and volatility in parts per million per step. */
  driftPpm: number;
  volPpm: number;
  /** When set the base is a NAV that grows by this many parts per billion per step, with no noise. */
  navAccrualPpb?: number;
  /** When set the base walk is pulled toward `target` by `reversionPpm` of the gap each step. */
  peg?: { target: string; reversionPpm: number };
  /** The premium of a representation over the base: volatility, pull to zero and clamp, in ppm. */
  premium: { volPpm: number; reversionPpm: number; maxPpm: number };
  jumps: readonly Jump[];
}

/** A lazily extended series; step `k` is always the same value for the same profile. */
export class Series {
  private readonly values: bigint[] = [];
  constructor(private readonly produce: (k: number, previous: bigint | undefined) => bigint) {}

  at(k: number): bigint {
    while (this.values.length <= k) {
      this.values.push(this.produce(this.values.length, this.values[this.values.length - 1]));
    }
    return this.values[k] as bigint;
  }
}

export function claimSeries(profile: ClaimProfile): Series {
  const rng = new Prng(seedFrom(`claim:${profile.seed}`));
  const target = profile.peg ? parsePrice(profile.peg.target) : undefined;
  const jumps = [...profile.jumps].sort((a, b) => a.atMs - b.atMs);
  return new Series((k, previous) => {
    let price = previous ?? parsePrice(profile.startPrice);
    if (previous !== undefined) {
      if (profile.navAccrualPpb !== undefined) {
        price += (price * BigInt(profile.navAccrualPpb)) / PPB;
      } else {
        const z = BigInt(rng.normalQ16());
        let ret = BigInt(profile.driftPpm) + (BigInt(profile.volPpm) * z) / BigInt(Q16);
        if (profile.peg && target !== undefined) {
          ret += (BigInt(profile.peg.reversionPpm) * (target - price)) / price;
        }
        price += (price * ret) / PPM;
      }
      const stepStart = SIM_ANCHOR_MS + (k - 1) * STEP_MS;
      for (const jump of jumps) {
        if (jump.atMs > stepStart && jump.atMs <= stepStart + STEP_MS) {
          price = (price * jump.num) / jump.den;
        }
      }
    }
    return price > 0n ? price : 1n;
  });
}

/** Premium of a representation over its claim, in parts per million, clamped to the profile. */
export function premiumSeries(profile: ClaimProfile, representationId: string): Series {
  const rng = new Prng(seedFrom(`premium:${representationId}`));
  const { volPpm, reversionPpm, maxPpm } = profile.premium;
  const max = BigInt(maxPpm);
  return new Series((_k, previous = 0n) => {
    const z = BigInt(rng.normalQ16());
    const next =
      previous - (previous * BigInt(reversionPpm)) / PPM + (BigInt(volPpm) * z) / BigInt(Q16);
    return next > max ? max : next < -max ? -max : next;
  });
}
