// Environment configuration for the API process (BuildPlan B9). Testnet only.

import { z } from "zod";

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
  /** 0 disables the background registry sync (use `pnpm sync` instead). */
  REGISTRY_SYNC_INTERVAL_MS: z.coerce.number().int().min(0).default(15_000),
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
