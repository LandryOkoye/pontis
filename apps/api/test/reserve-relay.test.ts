// POST /v1/reserves/attestations (ADR 0020 section 10): the relayer passes the signed attestation
// to the contract in its snake_case shape; the contract decides, the API reports.

import { ApiErrorSchema, ENDPOINTS, type SubmitReserveAttestationRequest } from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import {
  RelayRefusedError,
  type ReserveAttestationCall,
  type ReserveRelayer,
} from "../src/custody/chain.ts";
import { failureOf } from "../src/custody/near-relayer.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { fixtureRepo } from "./custody-helpers.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
const apps: FastifyInstance[] = [];
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await t.drop();
});

const body: SubmitReserveAttestationRequest = {
  attestation: {
    version: 1,
    contract: "core.testnet",
    representationId: "tgold-a",
    custodianId: "vault-co-sim",
    reservedUnits: "1000000000000",
    asOfMs: 1_790_000_000_000,
    reportHash: "e".repeat(64),
    reportUri: "sim://reserves/tgold-a/2026-11",
    simulated: true,
    source: "simulated_custodian",
  },
  signature: "c2lnbmF0dXJl",
  publicKey: "ed25519:6E8bAu1MUKRDM9dvKGbgYxEFJt4sr4Z5k1QYtUwrBXRp",
};

function appWith(relayer: ReserveRelayer | undefined) {
  const app = buildApp({
    ...testAppDeps(t.db),
    custodyChain: fixtureRepo(),
    ...(relayer ? { reserveRelayer: relayer } : {}),
  });
  apps.push(app);
  return app;
}
const post = (app: FastifyInstance, payload: unknown) =>
  app.inject({ method: "POST", url: "/v1/reserves/attestations", payload: payload as object });

describe("POST /v1/reserves/attestations", () => {
  it("relays the attestation in the contract's shape and returns the transaction hash", async () => {
    const calls: ReserveAttestationCall[] = [];
    const app = appWith({
      submitReserveAttestation: async (call) => {
        calls.push(call);
        return { txHash: "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T" };
      },
    });
    const res = await post(app, body);
    expect(res.statusCode).toBe(201);
    expect(ENDPOINTS.submitReserveAttestation.response.parse(res.json())).toEqual({
      txHash: "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T",
      representationId: "tgold-a",
      custodianId: "vault-co-sim",
      simulated: true,
    });
    expect(calls).toEqual([
      {
        attestation: {
          version: 1,
          contract: "core.testnet",
          representation_id: "tgold-a",
          custodian_id: "vault-co-sim",
          reserved_units: "1000000000000",
          as_of_ms: 1_790_000_000_000,
          report_hash: "e".repeat(64),
          report_uri: "sim://reserves/tgold-a/2026-11",
          simulated: true,
          source: "simulated_custodian",
        },
        signature: "c2lnbmF0dXJl",
        publicKey: body.publicKey,
      },
    ]);
  });

  it("reports the contract's refusal as 422 ATTESTATION_REJECTED", async () => {
    const app = appWith({
      submitReserveAttestation: async () => {
        throw new RelayRefusedError("bad signature");
      },
    });
    const res = await post(app, body);
    expect(res.statusCode).toBe(422);
    const error = ApiErrorSchema.parse(res.json());
    expect(error.code).toBe("ATTESTATION_REJECTED");
    expect(error.message).toContain("bad signature");
  });

  it("answers 404 when no relayer is configured, without touching the chain", async () => {
    const res = await post(appWith(undefined), body);
    expect([res.statusCode, ApiErrorSchema.parse(res.json()).code]).toEqual([404, "NOT_FOUND"]);
  });

  it("404s an unknown asset and 400s an attestation signed for another contract", async () => {
    const app = appWith({
      submitReserveAttestation: async () => {
        throw new Error("must not be called");
      },
    });
    const ghost = await post(app, {
      ...body,
      attestation: { ...body.attestation, representationId: "ghost" },
    });
    expect(ghost.statusCode).toBe(404);
    const other = await post(app, {
      ...body,
      attestation: { ...body.attestation, contract: "other.testnet" },
    });
    expect([other.statusCode, ApiErrorSchema.parse(other.json()).code]).toEqual([
      400,
      "VALIDATION_ERROR",
    ]);
  });

  it.each([
    ["a bad report hash", { attestation: { ...body.attestation, reportHash: "xyz" } }],
    ["a version other than 1", { attestation: { ...body.attestation, version: 2 } }],
    ["a float amount", { attestation: { ...body.attestation, reservedUnits: "1.5" } }],
    ["no signature", { signature: undefined }],
    ["an unknown field", { extra: true }],
  ])("400s %s", async (_name, patch) => {
    const app = appWith({
      submitReserveAttestation: async () => ({ txHash: "x".repeat(40) }),
    });
    const res = await post(app, { ...body, ...patch });
    expect([res.statusCode, ApiErrorSchema.parse(res.json()).code]).toEqual([
      400,
      "VALIDATION_ERROR",
    ]);
  });
});

describe("failureOf", () => {
  it("reads a failed outcome's message and passes a success", () => {
    expect(failureOf({ SuccessValue: "" })).toBeUndefined();
    expect(failureOf("NotStarted")).toBeUndefined();
    expect(failureOf({ Failure: { ActionError: { kind: { FunctionCallError: "x" } } } })).toContain(
      "FunctionCallError",
    );
  });

  it("keeps a long failure short", () => {
    expect(failureOf({ Failure: "x".repeat(2_000) })?.length).toBeLessThanOrEqual(300);
  });
});
