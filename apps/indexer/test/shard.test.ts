import { describe, expect, it } from "vitest";
import { parseShardLayout, shardOf } from "../src/shard.ts";

// Testnet's layout at the time of writing: ten shards after several splits.
const TESTNET = {
  V3: {
    boundary_accounts: [
      "650",
      "aurora",
      "aurora-0",
      "dev-1662050149030-28642112951491-0",
      "earn.kaiching",
      "game.hot.tg",
      "game.hot.tg-0",
      "kkuuue2akv_1630967379.near",
      "tge-lockup.sweat",
    ],
    shard_ids: [10, 11, 1, 12, 13, 9, 6, 7, 4, 5],
  },
};

describe("shardOf", () => {
  const layout = parseShardLayout(TESTNET);

  it("puts the contract's accounts in the shard that owns their name range", () => {
    expect(layout && shardOf(layout, "pontis-core.pontis.testnet")).toBe(4);
    expect(layout && shardOf(layout, "pontis.testnet")).toBe(4);
    expect(layout && shardOf(layout, "000.testnet")).toBe(10);
    expect(layout && shardOf(layout, "zzz.testnet")).toBe(5);
  });

  it("treats a boundary account as belonging to the shard that starts at it", () => {
    expect(layout && shardOf(layout, "aurora")).toBe(1);
    expect(layout && shardOf(layout, "650")).toBe(11);
  });

  it("reads the single-shard sandbox layout and rejects shapes it cannot place accounts in", () => {
    const sandbox = parseShardLayout({ V2: { boundary_accounts: [], shard_ids: [0] } });
    expect(sandbox && shardOf(sandbox, "pontis-core.test.near")).toBe(0);
    expect(parseShardLayout({ V1: { fixed_shards: [], boundary_accounts: [] } })).toBeUndefined();
  });
});
