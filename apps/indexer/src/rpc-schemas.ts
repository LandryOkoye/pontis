// The parts of NEAR RPC responses the indexer reads (everything else is ignored).

import { z } from "zod";

export const BlockSchema = z.object({
  header: z.object({ height: z.number(), hash: z.string() }),
  chunks: z.array(
    z.object({ chunk_hash: z.string(), shard_id: z.number(), height_included: z.number() }),
  ),
});
export const ChunkSchema = z.object({
  receipts: z.array(z.object({ receipt_id: z.string(), receiver_id: z.string() })),
});
export const ProofSchema = z.object({
  block_header_lite: z.object({
    inner_lite: z.object({ height: z.number(), timestamp_nanosec: z.string() }),
  }),
  outcome_proof: z.object({
    block_hash: z.string(),
    outcome: z.object({
      logs: z.array(z.string()),
      status: z.union([z.string(), z.record(z.string(), z.unknown())]),
    }),
  }),
});
