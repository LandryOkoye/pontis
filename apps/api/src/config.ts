// Environment configuration for the API process (BuildPlan B9). Testnet only.

import { z } from "zod";
import { DEFAULT_INDEXER_MAX_LAG_BLOCKS, DEFAULT_INDEXER_STALE_AFTER_MS } from "./routes/health.ts";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  NEAR_NETWORK_ID: z.enum(["testnet", "sandbox"]).default("testnet"),
  NEAR_RPC_URL: z.string().url().default("https://rpc.testnet.near.org"),
  PONTIS_CORE_ACCOUNT_ID: z.string().min(2),
  /** `ed25519:<base58>` quote-signer secret key. Testnet only; never commit it. */
  QUOTE_SIGNER_SECRET_KEY: z.string().startsWith("ed25519:"),
  /** Bearer key for `/v1/admin/*`; unset closes the admin endpoints. At least 16 characters. */
  ADMIN_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
  /** Comma-separated browser origins allowed by CORS, for example `https://app.example.com`. */
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(
      z.array(
        z
          .string()
          .refine(
            (o) => URL.canParse(o) && new URL(o).origin === o,
            "must be an origin such as https://app.example.com",
          ),
      ),
    ),
  /** Requests per client per window: reads, writes (POST) and `/v1/admin`. */
  RATE_LIMIT_READ: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WRITE: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_ADMIN: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  /** Behind a reverse proxy, take the client address from `X-Forwarded-For`. */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** 0 disables the background registry sync (use `pnpm sync` instead). */
  REGISTRY_SYNC_INTERVAL_MS: z.coerce.number().int().min(0).default(15_000),
  /** Health: an indexer heartbeat older than this is `stale` (stopped or crashed). */
  INDEXER_STALE_AFTER_MS: z.coerce.number().int().min(1000).default(DEFAULT_INDEXER_STALE_AFTER_MS),
  /** Health: a running indexer more than this many blocks behind the chain is `lagging`. */
  INDEXER_MAX_LAG_BLOCKS: z.coerce.number().int().min(0).default(DEFAULT_INDEXER_MAX_LAG_BLOCKS),
  /** How often unused quotes past their expiry are marked EXPIRED. */
  QUOTE_SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(10_000),
});

export type Config = z.infer<typeof EnvSchema>;

/** Throws a readable error listing every missing or invalid variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment: ${problems.join("; ")}`);
}
