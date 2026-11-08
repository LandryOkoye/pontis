import { describe, expect, it } from "vitest";
import { NearChainSource } from "../src/near-source.ts";
import { CORE, block, node, noSleep, proof } from "./fake-node.ts";

describe("NearChainSource failures", () => {
  it("flags a failed receipt so its logs are not trusted", async () => {
    const { rpc } = node({
      block: (p) => (p.finality ? block(10, []) : block(5, [{ hash: "C", shard: 0, included: 5 }])),
      EXPERIMENTAL_protocol_config: () => ({ result: { shard_layout: "unknown shape" } }),
      chunk: () => ({ result: { receipts: [{ receipt_id: "r", receiver_id: CORE }] } }),
      EXPERIMENTAL_light_client_proof: () =>
        proof(6, { Failure: { ActionError: { kind: "FunctionCallError" } } }, ["EVENT_JSON:{}"]),
    });
    const source = new NearChainSource(rpc, CORE, { retry: noSleep });
    await source.finalHeight();
    const [execution] = await source.executionsAt(5);
    expect(execution?.success).toBe(false);
  });

  it("treats a skipped height as empty but surfaces other node errors", async () => {
    const unknown = {
      error: { code: -32000, message: "Server error", cause: { name: "UNKNOWN_BLOCK" } },
      status: 422,
    };
    const skipped = node({ block: (p) => (p.finality ? block(10, []) : unknown) });
    const source = new NearChainSource(skipped.rpc, CORE, { retry: noSleep });
    await source.finalHeight();
    expect(await source.executionsAt(7)).toEqual([]);

    const broken = node({
      block: (p) =>
        p.finality
          ? block(10, [])
          : { error: { code: -32602, message: "bad", cause: { name: "INVALID_REQUEST" } } },
    });
    const strict = new NearChainSource(broken.rpc, CORE, { retry: noSleep });
    await strict.finalHeight();
    await expect(strict.executionsAt(7)).rejects.toThrow("bad");
  });

  it("retries a flaky node", async () => {
    let failures = 2;
    const { rpc, calls } = node({
      block: () => (failures-- > 0 ? { status: 502 } : block(10, [])),
    });
    const source = new NearChainSource(rpc, CORE, { retry: noSleep });
    expect(await source.finalHeight()).toBe(10);
    expect(calls).toHaveLength(3);
  });

  it("requires a final head before it reads receipts", async () => {
    const source = new NearChainSource(node({}).rpc, CORE, { retry: noSleep });
    await expect(source.executionsAt(1)).rejects.toThrow("finalHeight()");
  });
});
