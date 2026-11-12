import { describe, expect, it } from "vitest";
import type { Chain } from "../lib/chain.ts";
import { buildCatalogue } from "../lib/catalogue-plan.ts";
import { catalogueFor } from "../lib/catalogue-tiers.ts";
import { estimateStateBytes, STORAGE_BYTE_COST, topUpFor } from "../lib/seed-catalogue-funding.ts";
import { seedRelationship } from "../lib/seed-catalogue-pairs.ts";

const plan = buildCatalogue("pontis.testnet", undefined, catalogueFor("full"));
const rel = (a: string, b: string) => {
  const found = plan.relationships.find(
    (r) => r.pair.representation_a_id === a && r.pair.representation_b_id === b,
  );
  if (!found) throw new Error(`no relationship ${a}:${b}`);
  return found;
};

/** A chain that remembers the state-changing calls and answers views from `state`. */
function fakeChain(state: { compatibility?: unknown; guard?: unknown }) {
  const calls: string[] = [];
  const chain = {
    config: { coreId: "core.pontis.testnet" },
    view: async (_id: string, method: string) =>
      method === "get_compatibility" ? (state.compatibility ?? null) : (state.guard ?? null),
    call: async (_id: string, method: string) => {
      calls.push(method);
    },
  } as unknown as Chain;
  return { chain, calls };
}

describe("seedRelationship", () => {
  it("proposes, evidences, approves and guards an approved pair, in that order", async () => {
    const { chain, calls } = fakeChain({});
    await seedRelationship(chain, rel("tgkg-a", "tgkg-d"));
    expect(calls).toEqual([
      "propose_compatibility",
      "add_compatibility_evidence",
      "approve_compatibility",
      "set_route_guard",
    ]);
  });

  it("rejects the pair the story rejects and never approves or guards it", async () => {
    const { chain, calls } = fakeChain({});
    await seedRelationship(chain, rel("tmmfeur-c", "tmmfeur-e"));
    expect(calls).toEqual([
      "propose_compatibility",
      "add_compatibility_evidence",
      "reject_compatibility",
    ]);
  });

  it("leaves a proposed pair proposed", async () => {
    const { chain, calls } = fakeChain({});
    await seedRelationship(chain, rel("tbskt-c", "tbskt-o"));
    expect(calls).toEqual(["propose_compatibility", "add_compatibility_evidence"]);
  });

  it("proposes an ECONOMICALLY_SIMILAR pair as such and never approves it", async () => {
    const similar = rel("tlad-e", "ttb3m-e");
    expect(similar.classification).toBe("ECONOMICALLY_SIMILAR");
    const { chain, calls } = fakeChain({});
    await seedRelationship(chain, similar);
    expect(calls).not.toContain("approve_compatibility");
  });

  it("does nothing when the pair is approved, evidenced and guarded already", async () => {
    const { chain, calls } = fakeChain({
      compatibility: { status: "approved", evidence: [{}] },
      guard: { max_deviation_bps: 50 },
    });
    await seedRelationship(chain, rel("tgkg-a", "tgkg-d"));
    expect(calls).toEqual([]);
  });

  it("sets only the missing guard on an approved pair", async () => {
    const { chain, calls } = fakeChain({ compatibility: { status: "approved", evidence: [{}] } });
    await seedRelationship(chain, rel("tgkg-a", "tgkg-d"));
    expect(calls).toEqual(["set_route_guard"]);
  });
});

describe("core storage top-up", () => {
  it("needs nothing when the free balance covers the new state and the buffer", () => {
    expect(topUpFor(10n ** 25n, 1_000)).toBe(0n);
  });

  it("tops up whole NEAR, enough for the state plus 1 NEAR of headroom", () => {
    const bytes = 150_000;
    const need = BigInt(bytes) * STORAGE_BYTE_COST + 10n ** 24n;
    const amount = topUpFor(10n ** 24n, bytes);
    expect(amount % 10n ** 24n).toBe(0n);
    expect(10n ** 24n + amount).toBeGreaterThanOrEqual(need);
    expect(10n ** 24n + amount - need).toBeLessThan(10n ** 24n);
  });

  it("estimates more bytes for more records, with a per-record overhead", () => {
    expect(estimateStateBytes([])).toBe(0);
    expect(estimateStateBytes([{ id: "x" }])).toBeGreaterThan(estimateStateBytes([]) + 300 - 1);
    expect(estimateStateBytes([{ id: "x" }, { id: "y" }])).toBeGreaterThan(
      estimateStateBytes([{ id: "x" }]),
    );
  });
});
