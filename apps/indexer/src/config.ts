// Environment configuration for the indexer process (BuildPlan B12). Testnet only.

import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEAR_NETWORK_ID: z.enum(["testnet", "sandbox"]).default("testnet"),
  NEAR_RPC_URL: z.string({ error: "required; see docs/local-setup.md (RPC endpoints)" }).url(),
  PONTIS_CORE_ACCOUNT_ID: z.string().min(2),
  /** First block to index when there is no cursor yet; default is the current final block. */
  INDEXER_START_HEIGHT: z.coerce.number().int().min(0).optional(),
  /** Pause between polls once the indexer has caught up. */
  INDEXER_POLL_MS: z.coerce.number().int().min(100).default(2_000),
  /** Blocks re-read behind the cursor on start, in case a node served an incomplete view. */
  INDEXER_RESCAN_BLOCKS: z.coerce.number().int().min(0).default(30),
  /** Pause between reconciliation runs; 0 turns the reconciler off. */
  RECONCILE_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),
  /** A submitted quote with no outcome event after this long is flagged for reconciliation. */
  RECONCILE_STUCK_AFTER_MS: z.coerce.number().int().min(60_000).default(600_000),
  /** Settlement consistency is checked for quotes touched within this window. */
  RECONCILE_LOOKBACK_MS: z.coerce.number().int().min(60_000).default(604_800_000),
  /** Parallel chunk reads per block; keep low on public RPC endpoints. */
  INDEXER_CHUNK_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
});

export type Config = z.infer<typeof EnvSchema>;

/** Throws a readable error listing every missing or invalid variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment: ${problems.join("; ")}`);
}
