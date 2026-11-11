// Environment for the simulator process. It writes to the database only; no chain access.

import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SIM_BACKFILL_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  SIM_TICK_MS: z.coerce.number().int().min(1_000).default(10_000),
});

export type Config = z.infer<typeof EnvSchema>;

/** Throws a readable error listing every missing or invalid variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment: ${problems.join("; ")}`);
}
