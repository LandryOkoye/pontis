import { describe, expect, it } from "vitest";
import { catalogueFor } from "../lib/catalogue-tiers.ts";
import { CUSTODIANS } from "../lib/catalogue-custody-custodians.ts";
import { CONTRACT_LIMITS } from "../lib/catalogue-custody-types.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";
import { REAL_BRAND_DENYLIST, REAL_CUSTODIAN_DENYLIST } from "./real-brands.ts";

const norm = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
const mentions = (text: string, list: readonly string[]) =>
  list.filter((b) => norm(text).includes(norm(b)));

describe("custody tiers", () => {
  it("gives mvp nothing, demo a few custodians and full the complete set", () => {
    expect(custodyFor("mvp").custodians).toEqual([]);
    const demo = custodyFor("demo").custodians;
    expect(demo.length).toBeGreaterThanOrEqual(3);
    expect(demo.length).toBeLessThanOrEqual(6);
    expect(custodyFor("full").custodians).toEqual(CUSTODIANS);
    for (const c of demo) expect(custodyFor("full").custodians).toContain(c);
  });
});

describe("custodian records", () => {
  it("have unique ids, names and valid contract ids", () => {
    expect(new Set(CUSTODIANS.map((c) => c.id)).size).toBe(CUSTODIANS.length);
    expect(new Set(CUSTODIANS.map((c) => c.name)).size).toBe(CUSTODIANS.length);
    for (const c of CUSTODIANS) expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-sim$/);
  });

  it("are labelled SIMULATED and sit in a two-letter jurisdiction", () => {
    for (const c of CUSTODIANS) {
      expect(c.name, c.id).toMatch(/\(SIMULATED\)$/);
      expect(c.jurisdiction, c.id).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("name no real custodian, vault operator, audit firm, company or token", () => {
    for (const c of CUSTODIANS) {
      const text = `${c.name} ${c.kind} ${c.id}`;
      expect(mentions(text, REAL_CUSTODIAN_DENYLIST), c.id).toEqual([]);
      expect(mentions(text, REAL_BRAND_DENYLIST), c.id).toEqual([]);
    }
  });

  it("do not reuse the name of a catalogue issuer", () => {
    const issuers = new Set(
      catalogueFor("full").issuers.map((i) => i.name.toLowerCase().replace(/[^a-z0-9]+/g, " ")),
    );
    for (const c of CUSTODIANS) {
      const bare = c.name.replace(/\(SIMULATED\)/, "").toLowerCase();
      expect(issuers.has(bare.replace(/[^a-z0-9]+/g, " ").trim()), c.id).toBe(false);
    }
  });

  it("never claim to be verified, audited or regulated", () => {
    for (const c of CUSTODIANS) {
      expect(`${c.name} ${c.kind}`, c.id).not.toMatch(/audited|regulated|licensed|insured|backed/i);
    }
  });
});

const full = catalogueFor("full");
const reps = new Map(full.representations.map((r) => [r.id, r]));
const rows = custodyFor("full").custody;

describe("custody links", () => {
  it("reference an existing representation and an existing custodian, once each", () => {
    const ids = new Set(CUSTODIANS.map((c) => c.id));
    expect(new Set(rows.map((r) => r.representationId)).size).toBe(rows.length);
    for (const r of rows) {
      expect(reps.has(r.representationId), r.representationId).toBe(true);
      expect(ids.has(r.custodianId), r.custodianId).toBe(true);
    }
  });

  it("link at most the contract's custodian cap per representation (one each here)", () => {
    const perRep = new Map<string, number>();
    for (const r of rows) perRep.set(r.representationId, (perRep.get(r.representationId) ?? 0) + 1);
    for (const n of perRep.values())
      expect(n).toBeLessThanOrEqual(CONTRACT_LIMITS.maxCustodiansPerLink);
  });

  it("only use a custodian the tier of the link already includes", () => {
    for (const tier of ["demo", "full"] as const) {
      const { custodians, custody } = custodyFor(tier);
      const ids = new Set(custodians.map((c) => c.id));
      const present = new Set(catalogueFor(tier).representations.map((r) => r.id));
      for (const r of custody) {
        expect(ids.has(r.custodianId), `${tier} ${r.representationId}`).toBe(true);
        expect(present.has(r.representationId), `${tier} ${r.representationId}`).toBe(true);
      }
    }
  });
});
