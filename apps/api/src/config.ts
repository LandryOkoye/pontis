// Environment configuration for the API process (BuildPlan B9). Testnet only.

import { z } from "zod";
import { DEFAULT_INDEXER_MAX_LAG_BLOCKS, DEFAULT_INDEXER_STALE_AFTER_MS } from "./routes/health.ts";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  NEAR_NETWORK_ID: z.enum(["testnet", "sandbox"]).default("testnet"),
  NEAR_RPC_URL: z.string({ error: "required; see docs/local-setup.md (RPC endpoints)" }).url(),
  PONTIS_CORE_ACCOUNT_ID: z.string().min(2),
  /** `ed25519:<base58>` quote-signer secret key. Testnet only; never commit it. */
  QUOTE_SIGNER_SECRET_KEY: z.string().startsWith("ed25519:"),
  /**
   * The relayer account that pays for relayed reserve attestations (ADR 0020). Testnet and sandbox
   * only; set both or neither. Without them `POST /v1/reserves/attestations` answers 404.
   */
  PONTIS_RELAYER_ACCOUNT_ID: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(2).optional(),
  ),
  PONTIS_RELAYER_SECRET_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().startsWith("ed25519:").optional(),
  ),
  /** Break-glass bearer key for `/v1/admin/*` (audited as `legacy-admin-key`); unset turns it off. At least 16 characters. */
  ADMIN_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
  /** The NEP-413 `recipient` wallets are told a sign-in is for; default `pontis-api.<network>`. */
  AUTH_RECIPIENT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(3).max(128).optional(),
  ),
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
  /** Optional: all five values are required together to activate EVM lending routes. */
  MORPHO_SEPOLIA_RPC_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  MORPHO_BLUE_ADDRESS: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  MORPHO_BLUE_MARKETS_JSON: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  PONTIS_COLLATERAL_REGISTRY_JSON: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().optional(),
  ),
  PONTIS_ORACLE_PRICES_JSON: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

export type Config = z.infer<typeof EnvSchema>;

const RelayerPairSchema = EnvSchema.refine(
  (c) =>
    (c.PONTIS_RELAYER_ACCOUNT_ID === undefined) === (c.PONTIS_RELAYER_SECRET_KEY === undefined),
  { message: "PONTIS_RELAYER_ACCOUNT_ID and PONTIS_RELAYER_SECRET_KEY must be set together" },
);

/** Throws a readable error listing every missing or invalid variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = RelayerPairSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment: ${problems.join("; ")}`);
}
