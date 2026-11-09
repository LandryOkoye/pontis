// Catalog: both assets are visible and labelled, and the pair is one approved direct equivalent.

import { ENDPOINTS } from "@pontis/api-types";
import { parse } from "../api.ts";
import { assert, section, step } from "../steps.ts";
import type { World } from "../world.ts";

export async function catalog(world: World): Promise<void> {
  section("Catalog");
  const { api } = world;

  await step(
    "both representations are listed, synthetic and unverified, with their unit definition",
    async () => {
      const items = parse(await api.get("/v1/assets"), ENDPOINTS.listAssets.response).items;
      assert.deepEqual(items.map((a) => a.id).sort(), ["tgold-a", "tgold-b"]);
      for (const summary of items) {
        assert.equal(summary.synthetic, true, `${summary.id} must be labelled synthetic`);
        assert.equal(summary.verificationStatus, "unverified");
        const asset = parse(await api.get(`/v1/assets/${summary.id}`), ENDPOINTS.getAsset.response);
        assert.ok(asset.canonicalAsset.unitDefinition.length > 0, "the unit definition is shown");
        assert.ok(asset.evidence.length > 0, "evidence is attached");
      }
    },
  );

  await step(
    "the pair is an approved DIRECT_EQUIVALENT relationship and its route is executable",
    async () => {
      const relationships = parse(
        await api.get("/v1/assets/tgold-a/compatibility"),
        ENDPOINTS.getAssetCompatibility.response,
      ).items;
      const toB = relationships.find((r) => r.counterpartId === "tgold-b");
      assert.equal(toB?.classification, "DIRECT_EQUIVALENT");
      assert.equal(toB?.status, "approved");
      const compare = parse(
        await api.post("/v1/routes/compare", {
          fromId: "tgold-a",
          toId: "tgold-b",
          amount: "1000000",
        }),
        ENDPOINTS.compareRoutes.response,
      );
      assert.equal(compare.routes[0]?.executable, true);
    },
  );
}
