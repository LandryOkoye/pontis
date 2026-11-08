// A fake NEAR RPC node for the chain-source tests.

import { RpcClient } from "@pontis/near-client";

export const CORE = "pontis-core.test.near";

type Handler = (params: Record<string, unknown>) => unknown;
type Reply = { result?: unknown; error?: unknown; status?: number };

/** An RPC node answering by method name; every request is recorded in `calls`. */
export function node(handlers: Record<string, Handler>) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const { method, params } = JSON.parse(String(init?.body)) as {
      method: string;
      params: Record<string, unknown>;
    };
    calls.push({ method, params });
    const reply = (handlers[method]?.(params) ?? { result: null }) as Reply;
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      json: async () => reply,
    };
  }) as unknown as typeof fetch;
  return { rpc: new RpcClient({ url: "http://node", fetch: fetchImpl }), calls };
}

export const block = (
  height: number,
  chunks: { hash: string; shard: number; included: number }[],
) => ({
  result: {
    header: { height, hash: `B${height}` },
    chunks: chunks.map((c) => ({
      chunk_hash: c.hash,
      shard_id: c.shard,
      height_included: c.included,
    })),
  },
});
export const proof = (height: number, status: unknown, logs: string[]) => ({
  result: {
    block_header_lite: { inner_lite: { height, timestamp_nanosec: "1794124239147825848" } },
    outcome_proof: { block_hash: `O${height}`, outcome: { logs, status } },
  },
});
export const layout = {
  result: { shard_layout: { V2: { boundary_accounts: ["m"], shard_ids: [0, 1] } } },
};
export const noSleep = { attempts: 3, baseMs: 1, maxMs: 1, sleep: async () => undefined };
