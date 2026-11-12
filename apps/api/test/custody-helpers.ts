import type { ChainPage } from "@pontis/near-client";
import {
  issuers,
  representations,
  fixtureCustodian,
  fixtureCustodyLink,
  fixtureIssuerReliability,
  fixtureRedemption,
  fixtureRedemptionTerms,
  fixtureReserveRecord,
  fixtureReserveStatus,
} from "@pontis/near-client/fixtures";
import type { CustodyRepository } from "../src/custody/chain.ts";

/** A repository over a list, paged like the contract's views: oldest first, `total` of everything. */
export function pagedOver<T>(
  all: readonly T[],
): (...a: [unknown, number, number] | [number, number]) => Promise<ChainPage<T>> {
  return async (...args) => {
    const [from, limit] = args.slice(-2) as [number, number];
    return { items: all.slice(from, from + limit), total: all.length };
  };
}

/** The ADR 0020 fixtures behind the repository interface; `over` replaces any view. */
export function fixtureRepo(over: Partial<CustodyRepository> = {}): CustodyRepository {
  return {
    getCustodians: pagedOver([fixtureCustodian]) as CustodyRepository["getCustodians"],
    getCustodian: async (id) => (id === fixtureCustodian.id ? fixtureCustodian : null),
    getCustodyLink: async (id) => (id === "tgold-a" ? fixtureCustodyLink : null),
    getReserveStatus: async () => fixtureReserveStatus,
    getReserveAttestations: async () => [fixtureReserveRecord],
    getReserveHistory: pagedOver([fixtureReserveRecord]) as CustodyRepository["getReserveHistory"],
    getRedemptionTerms: async () => fixtureRedemptionTerms,
    getRedemption: async (id) => (id === fixtureRedemption.id ? fixtureRedemption : null),
    getRedemptionsByUser: pagedOver([
      fixtureRedemption,
    ]) as CustodyRepository["getRedemptionsByUser"],
    getRedemptionsByRepresentation: pagedOver([
      fixtureRedemption,
    ]) as CustodyRepository["getRedemptionsByRepresentation"],
    getIssuerReliability: async () => fixtureIssuerReliability,
    getIssuer: async (id) => issuers.find((i) => i.id === id) ?? null,
    getRepresentation: async (id) => representations.find((r) => r.id === id) ?? null,
    getMintRequest: async () => null,
    getMintRequests: pagedOver([]) as CustodyRepository["getMintRequests"],
    getMintHeadroom: async () => ({
      headroom_units: "200000000000",
      circulating_units: "0",
      attested_units: "200000000000",
      state: "ok",
      mint_paused: false,
    }),
    ...over,
  };
}
