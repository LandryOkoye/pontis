// Pure market stat helpers (ADR 0015 section 4).

export interface Rankable {
  id: string;
  /** Null when supply is unknown; such assets are unranked, not ranked last. */
  marketCap: bigint | null;
}

/** Rank 1 is the largest market cap. Ties break by ID so the order is stable. */
export function rankByMarketCap(rows: readonly Rankable[]): Map<string, number | null> {
  const ranked = rows
    .filter((r): r is Rankable & { marketCap: bigint } => r.marketCap !== null)
    .sort((a, b) =>
      a.marketCap === b.marketCap ? a.id.localeCompare(b.id) : a.marketCap > b.marketCap ? -1 : 1,
    );
  const ranks = new Map<string, number | null>(rows.map((r) => [r.id, null]));
  ranked.forEach((r, i) => ranks.set(r.id, i + 1));
  return ranks;
}
