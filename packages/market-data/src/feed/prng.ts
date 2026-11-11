// Integer-only seeded randomness for the simulated feed (ADR 0015 section 2). No floating point:
// the same seed gives the same series on every machine.

const Q16 = 65_536;
/** The mean of twelve 16-bit uniform draws, times twelve. Subtracting it centres the sum on zero. */
const TWELVE_MEANS = 393_210;

/** FNV-1a over the text, as an unsigned 32-bit seed. */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast and good enough for a demo market. Not for anything secret. */
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform integer in `[0, bound)`. The modulo bias is negligible for a simulator. */
  below(bound: number): number {
    return this.nextU32() % bound;
  }

  /**
   * An approximately standard normal draw in units of 1/65536 (so 65536 is one standard
   * deviation): the Irwin-Hall sum of twelve uniform 16-bit draws, centred. Tails stop at 6 sigma.
   */
  normalQ16(): number {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += this.nextU32() >>> 16;
    return sum - TWELVE_MEANS;
  }
}

export { Q16 };
