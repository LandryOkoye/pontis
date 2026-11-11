// Environment configuration for the indexer process (BuildPlan B12). Testnet only.

import { z } from "zod";

/** An empty value in a `.env` file means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

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
  /** Pause between market job passes (trades, candles, stats, search); 0 turns them off. */
  MARKET_JOBS_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),
  /** Candles are rebuilt for this much recent time on each pass. */
  MARKET_JOBS_WINDOW_MS: z.coerce.number().int().min(60_000).default(7_200_000),
  /** Pause between reserve monitor passes; 0 turns the monitor off (ADR 0020). */
  RESERVE_MONITOR_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),
  /** Testnet account whose key signs `refresh_supply` and `evaluate_reserve`; both are permissionless. Without it the monitor only reads. */
  RESERVE_MONITOR_ACCOUNT_ID: optional(z.string().min(2)),
  /** `ed25519:` secret key of that account. A plain environment variable: testnet and sandbox only. */
  RESERVE_MONITOR_PRIVATE_KEY: optional(
    z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/, "must be an ed25519:<base58> secret key"),
  ),
  /** Parallel chunk reads per block; keep low on public RPC endpoints. */
  INDEXER_CHUNK_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
});

const Schema = EnvSchema.refine(
  (env) =>
    (env.RESERVE_MONITOR_ACCOUNT_ID === undefined) ===
    (env.RESERVE_MONITOR_PRIVATE_KEY === undefined),
  {
    message: "RESERVE_MONITOR_ACCOUNT_ID and RESERVE_MONITOR_PRIVATE_KEY must be set together",
    path: ["RESERVE_MONITOR_PRIVATE_KEY"],
  },
);

export type Config = z.infer<typeof EnvSchema>;

/** Throws a readable error listing every missing or invalid variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment: ${problems.join("; ")}`);
}
