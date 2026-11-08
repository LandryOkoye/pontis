// Which shard holds an account. Reading only that shard's chunk per block keeps RPC load to one
// chunk instead of one per shard (ten on testnet).

import { z } from "zod";

const LayoutSchema = z.object({
  boundary_accounts: z.array(z.string()),
  shard_ids: z.array(z.number()),
});
const ShardLayoutSchema = z.union([
  z.object({ V2: LayoutSchema }).transform((v) => v.V2),
  z.object({ V3: LayoutSchema }).transform((v) => v.V3),
]);

export type ShardLayout = z.infer<typeof ShardLayoutSchema>;

/** `undefined` for a layout this code does not understand; callers then read every shard. */
export function parseShardLayout(value: unknown): ShardLayout | undefined {
  const parsed = ShardLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** The shard of an account: the number of boundary accounts at or below it picks the shard. */
export function shardOf(layout: ShardLayout, accountId: string): number | undefined {
  const index = layout.boundary_accounts.filter((boundary) => boundary <= accountId).length;
  return layout.shard_ids[index];
}
