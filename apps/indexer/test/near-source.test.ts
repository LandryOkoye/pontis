import { describe, expect, it } from "vitest";
import { NearChainSource } from "../src/near-source.ts";
import { CORE, block, layout, node, noSleep, proof } from "./fake-node.ts";

describe("NearChainSource", () => {
  it("reads only the core's shard, only newly included chunks, and only receipts to the core", async () => {
    const { rpc, calls } = node({
      block: (p) =>
        p.finality
          ? block(100, [])
          : block(50, [
              { hash: "C0", shard: 0, included: 50 },
              { hash: "C1-old", shard: 1, included: 49 },
              { hash: "C1", shard: 1, included: 50 },
            ]),
      EXPERIMENTAL_protocol_config: () => layout,
      chunk: (p) => ({
        result: {
          receipts:
            p.chunk_id === "C1"
              ? [
                  { receipt_id: "r-core", receiver_id: CORE, receipt: { Action: {} } },
                  { receipt_id: "r-data", receiver_id: CORE, receipt: { Data: {} } },
                  {
                    receipt_id: "r-other",
                    receiver_id: "someone.test.near",
                    receipt: { Action: {} },
                  },
                ]
              : [{ receipt_id: "r-wrong-shard", receiver_id: CORE, receipt: { Action: {} } }],
        },
      }),
      EXPERIMENTAL_light_client_proof: () =>
        proof(51, { SuccessValue: "" }, ["EVENT_JSON:{}", "plain"]),
    });
    const source = new NearChainSource(rpc, CORE, { retry: noSleep });
    expect(await source.finalHeight()).toBe(100);
    // "pontis-core.test.near" sorts after the boundary "m", so the core lives in shard 1.
    const executions = await source.executionsAt(50);
    expect(executions).toEqual([
      {
        receiptId: "r-core",
        blockHeight: 51,
        blockHash: "O51",
        blockTimestamp: new Date(1794124239147),
        success: true,
        logs: ["EVENT_JSON:{}", "plain"],
      },
    ]);
    expect(calls.filter((c) => c.method === "chunk").map((c) => c.params.chunk_id)).toEqual(["C1"]);
    expect(calls.find((c) => c.method === "EXPERIMENTAL_light_client_proof")?.params).toMatchObject(
      { receipt_id: "r-core", receiver_id: CORE, light_client_head: "B100" },
    );
  });
});
