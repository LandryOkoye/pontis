import { createTestDb, type TestDb } from "@pontis/db/testing";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { loggerOptions, scrub } from "../src/logging.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { testAppDeps } from "./helpers.ts";

// Not real keys: the right shape, made up for the test.
const SECRET_KEY = `ed25519:${"5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZvpe".repeat(2)}`;
const DB_URL = "postgres://pontis:hunter2-password@db.internal:5432/pontis";
const ADMIN_KEY = "0123456789abcdef-admin-key";

describe("scrub", () => {
  it("removes secret keys, bearer tokens and connection-string credentials, and nothing else", () => {
    const out = scrub(
      `key ${SECRET_KEY} url ${DB_URL} header Bearer ${ADMIN_KEY} account alice.testnet`,
    );
    expect(out).toBe(
      "key ed25519:[redacted] url postgres://[redacted]@db.internal:5432/pontis header Bearer [redacted] account alice.testnet",
    );
  });
});

describe("what the API logs", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await syncRegistry(t.db, fixtureSource());
  });
  afterAll(async () => {
    await t.drop();
  });

  it("keeps secrets out of request lines and out of the error log of a failing request", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const base = testAppDeps(t.db);
    const app = buildApp({
      ...base,
      logger: true,
      logStream: stream,
      quotes: {
        ...base.quotes,
        chain: {
          ...base.quotes.chain,
          getRoute: async () => {
            throw new Error(`rpc failed using ${SECRET_KEY} against ${DB_URL}`);
          },
        },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/quotes?token=query-secret-value",
      headers: { authorization: `Bearer ${ADMIN_KEY}`, "idempotency-key": "idem-secret-key-0001" },
      payload: {
        fromId: "tgold-a",
        toId: "tgold-b",
        amountIn: "1000000",
        accountId: "alice.testnet",
      },
    });
    await app.close();

    expect(res.statusCode).toBe(500);
    const log = lines.join("");
    expect(log).toContain("unhandled error");
    for (const secret of [
      SECRET_KEY,
      "hunter2-password",
      ADMIN_KEY,
      "query-secret-value",
      "idem-secret-key-0001",
    ]) {
      expect(log, secret).not.toContain(secret);
    }
    expect(log).toContain('"url":"/v1/quotes"');
  });

  it("redacts sensitive headers if a caller logs them", () => {
    const options = loggerOptions();
    expect(options).toMatchObject({
      redact: {
        paths: expect.arrayContaining(["req.headers.authorization"]),
        censor: "[redacted]",
      },
    });
  });
});
