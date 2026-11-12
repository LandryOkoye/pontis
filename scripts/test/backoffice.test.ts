import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  planBackoffice,
  stepFor,
  syntheticReceiptHash,
  type RedemptionView,
} from "../lib/backoffice-plan.ts";
import {
  fetchRedemptions,
  parseBackofficeArgs,
  selectRepresentations,
} from "../lib/backoffice-ops.ts";
import type { View } from "../lib/reserve-chain.ts";

const T0 = 1_790_000_000_000;
const DELAYS = { acceptAfterMs: 10_000, fulfilAfterMs: 20_000 };
const NONE: ReadonlySet<number> = new Set();

function redemption(patch: Partial<RedemptionView> = {}): RedemptionView {
  return {
    id: 1,
    representation_id: "tgold-a",
    amount: "5000000",
    status: "requested",
    created_ms: T0,
    accept_deadline_ms: T0 + 86_400_000,
    accepted_ms: null,
    fulfil_deadline_ms: null,
    ...patch,
  };
}
const accepted = (patch: Partial<RedemptionView> = {}) =>
  redemption({
    status: "accepted",
    accepted_ms: T0 + 10_000,
    fulfil_deadline_ms: T0 + 10_000 + 3 * 86_400_000,
    ...patch,
  });

describe("back-office plan", () => {
  it("waits, then accepts a requested redemption", () => {
    expect(stepFor(redemption(), DELAYS, NONE, T0 + 9_999)).toBeNull();
    expect(stepFor(redemption(), DELAYS, NONE, T0 + 10_000)).toEqual({
      kind: "accept",
      id: 1,
      representationId: "tgold-a",
    });
  });

  it("does not try to accept after the accept deadline", () => {
    const r = redemption({ accept_deadline_ms: T0 + 60_000 });
    expect(stepFor(r, DELAYS, NONE, T0 + 60_000)).toMatchObject({ kind: "accept" });
    expect(stepFor(r, DELAYS, NONE, T0 + 60_001)).toBeNull();
  });

  it("fulfils an accepted redemption fulfil-after-ms after the acceptance, with a receipt hash", () => {
    const r = accepted();
    expect(stepFor(r, DELAYS, NONE, T0 + 29_999)).toBeNull();
    const step = stepFor(r, DELAYS, NONE, T0 + 30_000);
    expect(step).toEqual({
      kind: "fulfil",
      id: 1,
      representationId: "tgold-a",
      evidenceHash: syntheticReceiptHash(r),
    });
    expect(step).toMatchObject({ evidenceHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("does not try to fulfil after the fulfil deadline", () => {
    const r = accepted({ fulfil_deadline_ms: T0 + 40_000 });
    expect(stepFor(r, DELAYS, NONE, T0 + 40_000)).toMatchObject({ kind: "fulfil" });
    expect(stepFor(r, DELAYS, NONE, T0 + 40_001)).toBeNull();
  });

  it("leaves an ignored redemption alone in every state, so it expires", () => {
    const ignore = new Set([1]);
    expect(stepFor(redemption(), DELAYS, ignore, T0 + 1_000_000)).toBeNull();
    expect(stepFor(accepted(), DELAYS, ignore, T0 + 1_000_000)).toBeNull();
    expect(stepFor(redemption({ id: 2 }), DELAYS, ignore, T0 + 1_000_000)).not.toBeNull();
  });

  it("takes no action on anything already resolved", () => {
    for (const status of ["fulfilled", "rejected", "expired", "reclaimed"]) {
      expect(stepFor(redemption({ status }), DELAYS, NONE, T0 + 1_000_000)).toBeNull();
    }
  });

  it("is inert on an accepted redemption that carries no acceptance time", () => {
    expect(stepFor(accepted({ accepted_ms: null }), DELAYS, NONE, T0 + 1_000_000)).toBeNull();
  });

  it("plans every due step, oldest first, skipping ignored ids", () => {
    const steps = planBackoffice(
      [
        accepted({ id: 5 }),
        redemption({ id: 3 }),
        redemption({ id: 4, created_ms: T0 + 100_000 }),
        redemption({ id: 2 }),
      ],
      DELAYS,
      new Set([2]),
      T0 + 30_000,
    );
    expect(steps.map((s) => `${s.kind}:${s.id}`)).toEqual(["accept:3", "fulfil:5"]);
  });

  it("hashes a synthetic receipt, the same one on every retry", () => {
    const hash = syntheticReceiptHash(redemption());
    expect(hash).toBe(syntheticReceiptHash(redemption()));
    expect(hash).toBe(
      createHash("sha256")
        .update("SIMULATED fulfilment receipt: redemption 1, tgold-a, 5000000 units")
        .digest("hex"),
    );
    expect(syntheticReceiptHash(redemption({ id: 2 }))).not.toBe(hash);
  });
});

describe("backoffice arguments", () => {
  it("has demo-sized defaults", () => {
    expect(parseBackofficeArgs([], {})).toEqual({
      acceptAfterMs: 10_000,
      fulfilAfterMs: 20_000,
      intervalMs: 5_000,
      once: false,
      ignore: [],
      representations: [],
      issuers: [],
    });
  });

  it("takes repeatable --ignore, --representation and --issuer", () => {
    expect(
      parseBackofficeArgs(
        [
          "--accept-after-ms",
          "0",
          "--fulfil-after-ms",
          "5000",
          "--ignore",
          "7",
          "--ignore",
          "3",
          "--ignore",
          "7",
          "--representation",
          "tgold-a",
          "--issuer",
          "meridian-sim",
          "--once",
        ],
        {},
      ),
    ).toEqual({
      acceptAfterMs: 0,
      fulfilAfterMs: 5_000,
      intervalMs: 5_000,
      once: true,
      ignore: [3, 7],
      representations: ["tgold-a"],
      issuers: ["meridian-sim"],
    });
  });

  it("reads issuers from the environment unless given on the command line", () => {
    expect(parseBackofficeArgs([], { BACKOFFICE_ISSUER_IDS: "a-sim, b-sim" }).issuers).toEqual([
      "a-sim",
      "b-sim",
    ]);
    expect(
      parseBackofficeArgs(["--issuer", "c-sim"], { BACKOFFICE_ISSUER_IDS: "a-sim" }).issuers,
    ).toEqual(["c-sim"]);
  });

  it("refuses malformed values and unknown options", () => {
    expect(() => parseBackofficeArgs(["--ignore", "x"], {})).toThrow(/--ignore must be an integer/);
    expect(() => parseBackofficeArgs(["--ignore"], {})).toThrow(/needs a value/);
    expect(() => parseBackofficeArgs(["--accept-after-ms", "-1"], {})).toThrow(/integer/);
    expect(() => parseBackofficeArgs(["--interval-ms", "5"], {})).toThrow(/1000/);
    expect(() => parseBackofficeArgs(["--nope"], {})).toThrow(/unknown option/);
    expect(() => parseBackofficeArgs(["tgold-a"], {})).toThrow(/expected/);
    expect(() => parseBackofficeArgs(["--help"], {})).toThrow(/SIMULATED/);
  });
});

describe("backoffice chain reads", () => {
  const reps = [
    { id: "tgold-a", account_id: "tgold-a.pontis.testnet", issuer_id: "meridian-sim" },
    { id: "tgold-b", account_id: "tgold-b.pontis.testnet", issuer_id: "meridian-sim" },
    { id: "tbond-a", account_id: "tbond-a.pontis.testnet", issuer_id: "other-sim" },
  ];
  const issuers = [
    { id: "meridian-sim", controlled_accounts: ["issuer-bo.testnet"] },
    { id: "other-sim", controlled_accounts: ["someone-else.testnet"] },
  ];
  const terms: Record<string, unknown> = { "tgold-a": { version: 1 }, "tbond-a": { version: 1 } };
  const view: View = async <T>(_contract: string, method: string, args = {}) => {
    const a = args as { representation_id: string };
    return (
      method === "get_redemption_terms" ? (terms[a.representation_id] ?? null) : undefined
    ) as T | undefined;
  };
  const select = (command: { representations: string[]; issuers: string[] }) =>
    selectRepresentations(view, "core.testnet", reps, issuers, command, "issuer-bo.testnet");

  it("serves, by default, redeemable representations whose issuer controls the account", async () => {
    const { representations, notes } = await select({ representations: [], issuers: [] });
    expect(representations.map((r) => r.id)).toEqual(["tgold-a"]);
    expect(notes).toEqual([
      "tbond-a: issuer-bo.testnet is not in the controlled_accounts of other-sim",
    ]);
  });

  it("serves by issuer or by representation without needing terms", async () => {
    const byIssuer = await select({ representations: [], issuers: ["meridian-sim"] });
    expect(byIssuer.representations.map((r) => r.id)).toEqual(["tgold-a", "tgold-b"]);
    const byRep = await select({ representations: ["tgold-b", "missing"], issuers: [] });
    expect(byRep.representations.map((r) => r.id)).toEqual(["tgold-b"]);
    expect(byRep.notes).toEqual(["missing: no such representation"]);
  });

  it("pages every redemption of a representation until the total is covered", async () => {
    const all = Array.from({ length: 230 }, (_, i) => redemption({ id: i + 1 }));
    const calls: number[] = [];
    const paged: View = async <T>(_contract: string, _method: string, args = {}) => {
      const a = args as { from_index: number; limit: number };
      calls.push(a.from_index);
      return { items: all.slice(a.from_index, a.from_index + a.limit), total: all.length } as T;
    };
    const got = await fetchRedemptions(paged, "core.testnet", "tgold-a");
    expect(got).toHaveLength(230);
    expect(calls).toEqual([0, 100, 200]);
    const empty: View = async <T>() => ({ items: [], total: 0 }) as T;
    expect(await fetchRedemptions(empty, "core.testnet", "tgold-a")).toEqual([]);
  });
});
