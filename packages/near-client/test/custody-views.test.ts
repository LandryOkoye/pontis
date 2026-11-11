// The custody, reserve, mint and redemption views of ADR 0020: names, arguments, strict parsing.

import { describe, expect, it } from "vitest";
import { CoreClient } from "../src/core.ts";
import type { RpcClient } from "../src/rpc.ts";
import {
  fixtureCustodian,
  fixtureCustodyLink,
  fixtureEscrowLedger,
  fixtureIssuerReliability,
  fixtureRedemption,
  fixtureRedemptionTerms,
  fixtureReserveRecord,
  fixtureReserveStatus,
} from "../src/fixtures.ts";

type Call = { method: string; args: Record<string, unknown> };

function client(answer: unknown) {
  const calls: Call[] = [];
  const rpc = {
    view: async (_contract: string, method: string, args: Record<string, unknown> = {}) => {
      calls.push({ method, args });
      return answer;
    },
  } as unknown as RpcClient;
  return { core: new CoreClient(rpc, "core.testnet"), calls };
}

describe("custody views", () => {
  it("pages custodians with from_index and limit", async () => {
    const { core, calls } = client({ items: [fixtureCustodian], total: 1 });
    expect(await core.getCustodians(0, 50)).toEqual({ items: [fixtureCustodian], total: 1 });
    expect(calls[0]).toEqual({ method: "get_custodians", args: { from_index: 0, limit: 50 } });
  });

  it("returns null for an unknown custodian and a link not yet made", async () => {
    expect(await client(null).core.getCustodian("nope")).toBeNull();
    expect(await client(null).core.getCustodyLink("tgold-a")).toBeNull();
  });

  it("parses a custodian and a link", async () => {
    expect(await client(fixtureCustodian).core.getCustodian("vault-co-sim")).toEqual(
      fixtureCustodian,
    );
    const { core, calls } = client(fixtureCustodyLink);
    expect(await core.getCustodyLink("tgold-a")).toEqual(fixtureCustodyLink);
    expect(calls[0]?.args).toEqual({ representation_id: "tgold-a" });
  });

  it("refuses an unknown structure, a fifth custodian and a retired-looking typo", async () => {
    await expect(
      client({ ...fixtureCustodyLink, structure: "vaulted" }).core.getCustodyLink("a"),
    ).rejects.toThrow();
    await expect(
      client({
        ...fixtureCustodyLink,
        custodian_ids: ["a", "b", "c", "d", "e"],
      }).core.getCustodyLink("a"),
    ).rejects.toThrow();
    await expect(
      client({ ...fixtureCustodian, status: "gone" }).core.getCustodian("a"),
    ).rejects.toThrow();
  });
});

describe("reserve views", () => {
  it("asks for the newest attestation across custodians when none is named", async () => {
    const { core, calls } = client(fixtureReserveRecord);
    expect(await core.getReserveAttestation("tgold-a")).toEqual(fixtureReserveRecord);
    expect(calls[0]?.args).toEqual({ representation_id: "tgold-a", custodian_id: null });
    await core.getReserveAttestation("tgold-a", "vault-co-sim");
    expect(calls[1]?.args.custodian_id).toBe("vault-co-sim");
  });

  it("reads the latest of each custodian and a page of history", async () => {
    expect(await client([fixtureReserveRecord]).core.getReserveAttestations("tgold-a")).toEqual([
      fixtureReserveRecord,
    ]);
    const { core, calls } = client({ items: [fixtureReserveRecord], total: 9 });
    expect((await core.getReserveHistory("tgold-a", 4, 5)).total).toBe(9);
    expect(calls[0]).toEqual({
      method: "get_reserve_history",
      args: { representation_id: "tgold-a", from_index: 4, limit: 5 },
    });
  });

  it("parses the status, including a null ratio while nothing circulates", async () => {
    expect(await client(fixtureReserveStatus).core.getReserveStatus("tgold-a")).toEqual(
      fixtureReserveStatus,
    );
    const empty = { ...fixtureReserveStatus, ratio_bps: null, circulating_units: "0" };
    expect((await client(empty).core.getReserveStatus("tgold-a")).ratio_bps).toBeNull();
  });

  it("refuses a malformed status: a made-up state, a non-integer amount, a bad report hash", async () => {
    for (const bad of [
      { ...fixtureReserveStatus, state: "fine" },
      { ...fixtureReserveStatus, attested_units: "1.5" },
      { ...fixtureReserveStatus, action: "ignore" },
    ]) {
      await expect(client(bad).core.getReserveStatus("tgold-a")).rejects.toThrow();
    }
    await expect(
      client([{ ...fixtureReserveRecord, report_hash: "xyz" }]).core.getReserveAttestations("a"),
    ).rejects.toThrow();
  });

  it("parses supply and mint headroom and the mint request views", async () => {
    const supply = {
      ledger: "1",
      pending: "2",
      read: { units: "3", as_of_ms: 4 },
      circulating: "3",
    };
    expect(await client(supply).core.getSupply("tgold-a")).toEqual(supply);
    expect(await client({ ...supply, read: null }).core.getSupply("tgold-a")).toMatchObject({
      read: null,
    });
    const headroom = {
      headroom_units: "5",
      circulating_units: "3",
      attested_units: "8",
      state: "ok",
      mint_paused: false,
    };
    expect(await client(headroom).core.getMintHeadroom("tgold-a")).toEqual(headroom);
    const request = {
      id: 1,
      representation_id: "tgold-a",
      recipient: "alice.testnet",
      amount: "5000000",
      reference: "sub-0001",
      status: "requested",
      requested_by: "issuer-bo.testnet",
      requested_ms: 1,
      resolved_ms: null,
      failure: null,
    };
    expect(await client(request).core.getMintRequest(1)).toEqual(request);
    expect(await client(null).core.getMintRequest(9)).toBeNull();
    const { core, calls } = client({ items: [request], total: 1 });
    expect((await core.getMintRequests("tgold-a", 0, 0)).items).toHaveLength(1);
    expect(calls[0]?.method).toBe("get_mint_requests");
  });
});

describe("redemption views", () => {
  it("parses terms, null before they are set", async () => {
    expect(await client(fixtureRedemptionTerms).core.getRedemptionTerms("tgold-a")).toEqual(
      fixtureRedemptionTerms,
    );
    expect(await client(null).core.getRedemptionTerms("tgold-a")).toBeNull();
    await expect(
      client({
        ...fixtureRedemptionTerms,
        terms: { ...fixtureRedemptionTerms.terms, settlement_days: 31 },
      }).core.getRedemptionTerms("tgold-a"),
    ).rejects.toThrow();
  });

  it("parses a redemption and refuses an unknown status", async () => {
    const { core, calls } = client(fixtureRedemption);
    expect(await core.getRedemption(1)).toEqual(fixtureRedemption);
    expect(calls[0]).toEqual({ method: "get_redemption", args: { id: 1 } });
    expect(await client(null).core.getRedemption(2)).toBeNull();
    await expect(
      client({ ...fixtureRedemption, status: "paid" }).core.getRedemption(1),
    ).rejects.toThrow();
  });

  it("pages by user and by representation with the argument names of the ADR", async () => {
    const { core, calls } = client({ items: [fixtureRedemption], total: 1 });
    await core.getRedemptionsByUser("alice.testnet", 0, 20);
    await core.getRedemptionsByRepresentation("tgold-a", 0, 20);
    expect(calls).toEqual([
      {
        method: "get_redemptions_by_user",
        args: { account_id: "alice.testnet", from_index: 0, limit: 20 },
      },
      {
        method: "get_redemptions_by_representation",
        args: { representation_id: "tgold-a", from_index: 0, limit: 20 },
      },
    ]);
  });

  it("parses the escrow ledger and the issuer's counters", async () => {
    expect(await client(fixtureEscrowLedger).core.getEscrowLedger("tgold-a")).toEqual(
      fixtureEscrowLedger,
    );
    const { core, calls } = client(fixtureIssuerReliability);
    expect(await core.getIssuerReliability("synthetic-issuer-a")).toEqual(fixtureIssuerReliability);
    expect(calls[0]?.args).toEqual({ issuer_id: "synthetic-issuer-a" });
    await expect(
      client({ ...fixtureIssuerReliability, requested: -1 }).core.getIssuerReliability("a"),
    ).rejects.toThrow();
  });
});
