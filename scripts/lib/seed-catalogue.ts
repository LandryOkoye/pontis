// Seeds the demo catalogue of a tier (scripts/lib/catalogue-tiers.ts) on top of the MVP seed:
// issuers, claims, representations, relationships, starting supply, allowlist and vault inventory.
// Every step reads current state first, so re-running is safe. Order matters:
//
//   1. register and evidence every record; activate what the contract allows;
//   2. propose relationships; approve (and guard) the ones both of whose tokens are active, reject
//      the ones the story rejects;
//   3. mint, allowlist and fund while the issuers are still in the states that allow it;
//   4. move delisted representations, then issuers, to their final status last (`deprecated` and
//      `rejected` are terminal).
//
// Testnet and synthetic assets only. The contract accepts a representation for an issuer in any
// status but activates it only while the issuer is `active`, which is why a pending issuer's
// tokens stay `restricted` and a deprecated issuer's tokens had to be activated first.

import { admin, type Chain } from "./chain.ts";
import { buildCatalogue } from "./catalogue-plan.ts";
import { catalogueFor, DEFAULT_TIER, type CatalogueTier } from "./catalogue-tiers.ts";
import { ensureStateFunding } from "./seed-catalogue-funding.ts";
import { seedRelationship } from "./seed-catalogue-pairs.ts";
import { seedTokens } from "./seed-catalogue-tokens.ts";
import { grantRoles, type RegistryRecord } from "./seed-registry.ts";

export interface CatalogueSeedOptions {
  /** Extra accounts to allowlist on every catalogue representation, besides the deployer. */
  allowlist?: string[];
  /** Which catalogue to seed; `demo` when absent. `mvp` seeds nothing: the MVP seed is the catalogue. */
  tier?: CatalogueTier;
}

export async function seedCatalogue(
  chain: Chain,
  options: CatalogueSeedOptions = {},
): Promise<void> {
  const tier = options.tier ?? DEFAULT_TIER;
  const { coreId, deployerId } = chain.config;
  const core = <T>(method: string, args: Record<string, unknown> = {}) =>
    chain.view<T | null>(coreId, method, args);
  const act = (method: string, args: Record<string, unknown>) => admin(chain, coreId, method, args);
  const data = buildCatalogue(deployerId, undefined, catalogueFor(tier));
  if (data.representations.length === 0) {
    console.log(`catalogue tier ${tier}: nothing to seed beyond the MVP seed`);
    return;
  }
  console.log(
    `seeding the ${tier} catalogue: ${data.issuers.length} issuers, ${data.claims.length} claims, ${data.representations.length} representations, ${data.relationships.length} relationships`,
  );

  for (const { representation } of data.representations) {
    if (!(await chain.exists(representation.account_id))) {
      throw new Error(
        `${representation.account_id} is not deployed: run deploy-testnet with --catalogue=${tier} first`,
      );
    }
  }
  await grantRoles(chain);

  // Records the registry does not hold yet, for the storage top-up.
  const pending: unknown[] = [];
  for (const { record, evidence } of data.issuers) {
    if (!(await core("get_issuer", { id: record.id }))) pending.push(record, evidence);
  }
  for (const { asset, evidence } of data.claims) {
    if (!(await core("get_canonical_asset", { id: asset.id }))) pending.push(asset, evidence);
  }
  for (const { representation, evidence } of data.representations) {
    if (!(await core("get_representation", { id: representation.id }))) {
      pending.push(representation, evidence);
    }
  }
  for (const { pair, ratio, scope, rationale, evidence } of data.relationships) {
    if (!(await core("get_compatibility", pair))) {
      pending.push({ pair, ratio, scope, rationale }, evidence);
    }
  }
  await ensureStateFunding(chain, pending);

  const ensure = async (
    label: string,
    subjectType: string,
    id: string,
    current: RegistryRecord | null | undefined,
    register: () => Promise<unknown>,
    evidence: unknown,
    /** The status method that activates it, or undefined to leave the record `restricted`. */
    activateWith: string | undefined,
  ) => {
    if (!current) {
      await register();
      console.log(`registered ${label} ${id}`);
    }
    if (!current || current.evidence.length === 0) {
      await act("add_evidence", { subject_type: subjectType, subject_id: id, evidence });
      console.log(`added evidence to ${label} ${id}`);
    }
    // Only a fresh (restricted) record is activated: a deprecated or rejected one is terminal.
    if (activateWith && (!current || current.status === "restricted")) {
      await act(activateWith, { id, status: "active" });
      console.log(`activated ${label} ${id}`);
    }
  };

  for (const { record, evidence, activate } of data.issuers) {
    await ensure(
      "issuer",
      "issuer",
      record.id,
      await core<RegistryRecord>("get_issuer", { id: record.id }),
      () => act("register_issuer", { issuer: record }),
      evidence,
      activate ? "set_issuer_status" : undefined,
    );
  }
  for (const { asset, evidence } of data.claims) {
    await ensure(
      "canonical asset",
      "canonical_asset",
      asset.id,
      await core<RegistryRecord>("get_canonical_asset", { id: asset.id }),
      () => act("register_canonical_asset", { asset }),
      evidence,
      "set_canonical_asset_status",
    );
  }
  for (const { representation, evidence, activate } of data.representations) {
    await ensure(
      "representation",
      "representation",
      representation.id,
      await core<RegistryRecord>("get_representation", { id: representation.id }),
      () => act("register_representation", { representation }),
      evidence,
      activate ? "set_representation_status" : undefined,
    );
  }

  for (const rel of data.relationships) await seedRelationship(chain, rel);

  const accounts = [...new Set([deployerId, ...(options.allowlist ?? [])])];
  await seedTokens(chain, data.representations, accounts);

  for (const { representation, finalStatus } of data.representations) {
    const current = await core<RegistryRecord>("get_representation", { id: representation.id });
    if (finalStatus !== "active" && current?.status === "active") {
      await act("set_representation_status", { id: representation.id, status: finalStatus });
      console.log(`moved representation ${representation.id} from active to ${finalStatus}`);
    }
  }
  for (const { record, finalStatus } of data.issuers) {
    const current = await core<RegistryRecord>("get_issuer", { id: record.id });
    if (current && current.status !== finalStatus) {
      await act("set_issuer_status", { id: record.id, status: finalStatus });
      console.log(`moved issuer ${record.id} from ${current.status} to ${finalStatus}`);
    }
  }
}
