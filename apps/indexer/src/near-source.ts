// Reads finalized `pontis-core` activity from NEAR RPC. A receipt is found in the chunk of the block
// that delivers it; its logs come from the execution outcome, fetched with a light-client proof
// (the only node-side lookup by receipt ID that needs no transaction hash).

import { RpcError, type RpcClient } from "@pontis/near-client";
import { HistoryUnavailableError, type ChainSource, type CoreExecution } from "./chain-source.ts";
import { BlockSchema, ChunkSchema, ProofSchema } from "./rpc-schemas.ts";
import { withRetry, type RetryOptions } from "./retry.ts";
import { parseShardLayout, shardOf, type ShardLayout } from "./shard.ts";

export interface NearChainSourceOptions {
  /** Chunk reads in flight at once. */
  concurrency?: number;
  retry?: RetryOptions;
  /** How long a fetched shard layout is trusted. */
  layoutTtlMs?: number;
  now?: () => number;
}

const DEFAULT_RETRY: RetryOptions = { attempts: 5, baseMs: 500, maxMs: 8_000 };

export class NearChainSource implements ChainSource {
  private finalHash: string | undefined;
  private layout: { value: ShardLayout | undefined; fetchedAt: number } | undefined;
  private readonly concurrency: number;
  private readonly retry: RetryOptions;
  private readonly layoutTtlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly rpc: RpcClient,
    private readonly coreId: string,
    options: NearChainSourceOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 4;
    this.retry = options.retry ?? DEFAULT_RETRY;
    this.layoutTtlMs = options.layoutTtlMs ?? 600_000;
    this.now = options.now ?? Date.now;
  }

  private call(method: string, params: unknown): Promise<unknown> {
    return withRetry(() => this.rpc.call(method, params), this.retry);
  }

  async finalHeight(): Promise<number> {
    const block = BlockSchema.parse(await this.call("block", { finality: "final" }));
    this.finalHash = block.header.hash;
    return block.header.height;
  }

  async executionsAt(height: number): Promise<CoreExecution[]> {
    const finalHash = this.finalHash;
    if (!finalHash) throw new Error("finalHeight() must be called before executionsAt()");
    const block = await this.blockAt(height);
    if (!block) return [];
    const shard = await this.coreShard();
    // A chunk is listed in every block after it was produced; read it once, where it was included.
    const chunks = block.chunks.filter(
      (c) =>
        c.height_included === block.header.height && (shard === undefined || c.shard_id === shard),
    );
    const receiptIds = (
      await this.mapLimit(chunks, async (chunk) =>
        ChunkSchema.parse(await this.call("chunk", { chunk_id: chunk.chunk_hash }))
          .receipts.filter((r) => r.receiver_id === this.coreId && r.receipt.Action !== undefined)
          .map((r) => r.receipt_id),
      )
    ).flat();
    return this.mapLimit(receiptIds, (receiptId) => this.execution(receiptId, finalHash));
  }

  private async blockAt(height: number) {
    try {
      return BlockSchema.parse(await this.call("block", { block_id: height }));
    } catch (error) {
      if (!(error instanceof RpcError) || error.causeName !== "UNKNOWN_BLOCK") throw error;
      // The chain skips heights when a producer is offline, but a node also forgets old blocks:
      // only the first is an empty block. Losing history silently would lose settlements.
      const { earliestBlockHeight } = await this.rpcStatus();
      if (earliestBlockHeight !== undefined && height < earliestBlockHeight) {
        throw new HistoryUnavailableError(height, earliestBlockHeight);
      }
      return undefined;
    }
  }

  private rpcStatus() {
    return withRetry(() => this.rpc.status(), this.retry);
  }

  private async execution(receiptId: string, finalHash: string): Promise<CoreExecution> {
    const proof = ProofSchema.parse(
      await this.call("EXPERIMENTAL_light_client_proof", {
        type: "receipt",
        receipt_id: receiptId,
        receiver_id: this.coreId,
        light_client_head: finalHash,
      }),
    );
    const { status, logs } = proof.outcome_proof.outcome;
    const outcome = typeof status === "string" ? status : Object.keys(status)[0];
    return {
      receiptId,
      blockHeight: proof.block_header_lite.inner_lite.height,
      blockHash: proof.outcome_proof.block_hash,
      blockTimestamp: new Date(
        Number(BigInt(proof.block_header_lite.inner_lite.timestamp_nanosec) / 1_000_000n),
      ),
      success: outcome === "SuccessValue" || outcome === "SuccessReceiptId",
      logs,
    };
  }

  private async coreShard(): Promise<number | undefined> {
    const stale = !this.layout || this.now() - this.layout.fetchedAt > this.layoutTtlMs;
    if (stale) {
      const config = (await this.call("EXPERIMENTAL_protocol_config", { finality: "final" })) as {
        shard_layout?: unknown;
      };
      this.layout = { value: parseShardLayout(config.shard_layout), fetchedAt: this.now() };
    }
    return this.layout?.value ? shardOf(this.layout.value, this.coreId) : undefined;
  }

  private async mapLimit<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
      for (let i = next++; i < items.length; i = next++) results[i] = await fn(items[i] as T);
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, items.length) }, worker));
    return results;
  }
}
