// The simulated price feed (ADR 0015 section 5). Every point it returns is `simulated: true`.
// A claim has one base series (random walk, NAV accrual or a peg, with scheduled jumps for
// corporate actions); each representation prices that claim per whole token and adds its own small
// mean-reverting premium, so two wrappers of one claim trade at slightly different prices.
// Integer math only: prices are bigint at 8 decimals, rates are integer parts per million or
// billion per step.

import {
  PPM,
  SIM_ANCHOR_MS,
  STEP_MS,
  claimSeries,
  premiumSeries,
  type ClaimProfile,
  type Series,
} from "./series.ts";
import type { FeedPoint, NavPoint, PriceFeed } from "./types.ts";

export interface RepresentationProfile {
  claimId: string;
  /** Canonical units in one whole token, as a ratio. */
  canonicalPerToken: { num: bigint; den: bigint };
}

export interface SimulatedFeedConfig {
  claims: Readonly<Record<string, ClaimProfile>>;
  representations: Readonly<Record<string, RepresentationProfile>>;
  currency?: string;
}

export class SimulatedPriceFeed implements PriceFeed {
  readonly id = "simulated";
  private readonly currency: string;
  private readonly claims = new Map<string, Series>();
  private readonly premiums = new Map<string, Series>();

  constructor(private readonly config: SimulatedFeedConfig) {
    this.currency = config.currency ?? "USD";
  }

  /** Representations this feed can price. */
  representationIds(): string[] {
    return Object.keys(this.config.representations);
  }

  /** Whether the representation's claim is a NAV series (a fund or a note), so it has NAV points. */
  hasNav(representationId: string): boolean {
    const rep = this.config.representations[representationId];
    return rep !== undefined && this.config.claims[rep.claimId]?.navAccrualPpb !== undefined;
  }

  latest(representationId: string, atMs: number): FeedPoint | undefined {
    const k = Math.floor((atMs - SIM_ANCHOR_MS) / STEP_MS);
    return k < 0 ? undefined : this.point(representationId, k);
  }

  history(representationId: string, fromMs: number, toMs: number): FeedPoint[] {
    const first = Math.max(0, Math.ceil((fromMs - SIM_ANCHOR_MS) / STEP_MS));
    const end = Math.ceil((toMs - SIM_ANCHOR_MS) / STEP_MS);
    const out: FeedPoint[] = [];
    for (let k = first; k < end; k++) out.push(this.point(representationId, k));
    return out;
  }

  /** NAV per whole token, no premium; empty when the claim has no NAV. */
  navHistory(representationId: string, fromMs: number, toMs: number): NavPoint[] {
    if (!this.hasNav(representationId)) return [];
    const { rep, claim } = this.profiles(representationId);
    const first = Math.max(0, Math.ceil((fromMs - SIM_ANCHOR_MS) / STEP_MS));
    const end = Math.ceil((toMs - SIM_ANCHOR_MS) / STEP_MS);
    const out: NavPoint[] = [];
    for (let k = first; k < end; k++) {
      const base = this.claimAt(rep.claimId, claim, k);
      out.push({
        representationId,
        nav: this.perToken(base, rep),
        currency: this.currency,
        asOfMs: SIM_ANCHOR_MS + k * STEP_MS,
        source: "simulated_feed",
        simulated: true,
      });
    }
    return out;
  }

  private profiles(representationId: string) {
    const rep = this.config.representations[representationId];
    const claim = rep && this.config.claims[rep.claimId];
    if (!rep || !claim) throw new Error(`no simulated profile for ${representationId}`);
    return { rep, claim };
  }

  private claimAt(claimId: string, claim: ClaimProfile, k: number): bigint {
    let series = this.claims.get(claimId);
    if (!series) this.claims.set(claimId, (series = claimSeries(claim)));
    return series.at(k);
  }

  private perToken(base: bigint, rep: RepresentationProfile): bigint {
    const value = (base * rep.canonicalPerToken.num) / rep.canonicalPerToken.den;
    return value > 0n ? value : 1n;
  }

  private point(representationId: string, k: number): FeedPoint {
    const { rep, claim } = this.profiles(representationId);
    let premiums = this.premiums.get(representationId);
    if (!premiums)
      this.premiums.set(representationId, (premiums = premiumSeries(claim, representationId)));
    const base = this.perToken(this.claimAt(rep.claimId, claim, k), rep);
    const price = (base * (PPM + premiums.at(k))) / PPM;
    return {
      representationId,
      price: price > 0n ? price : 1n,
      currency: this.currency,
      asOfMs: SIM_ANCHOR_MS + k * STEP_MS,
      source: "simulated_feed",
      simulated: true,
    };
  }
}
