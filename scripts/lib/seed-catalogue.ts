// Seeds the demo catalogue (scripts/lib/catalogue.ts) on top of the MVP seed: issuers, claims,
// representations, relationships, starting supply, allowlist and vault inventory. Every step
// reads current state first, so re-running is safe. Order matters:
//
//   1. register and evidence every record; activate what the contract allows;
//   2. propose relationships and approve the ones both of whose tokens are active;
//   3. mint, allowlist and fund while the issuers are still in the states that allow it;
//   4. move issuers to their final status last (`deprecated` and `rejected` are terminal).
//
// Testnet and synthetic assets only. The contract accepts a representation for an issuer in any
// status but activates it only while the issuer is `active`, which is why the pending issuer's
// tokens stay `restricted` and the deprecated issuer's token had to be activated first.

import { admin, type Chain } from "./chain.ts";
import { buildCatalogue } from "./catalogue-plan.ts";
import { grantRoles, type RegistryRecord } from "./seed-registry.ts";

export interface CatalogueSeedOptions {
  /** Extra accounts to allowlist on every catalogue representation, besides the deployer. */
  allowlist?: string[];
}

export async function seedCatalogue(
  chain: Chain,
  options: CatalogueSeedOptions = {},
): Promise<void> {
  const { coreId, deployerId } = chain.config;
  const core = <T>(method: string, args: Record<string, unknown> = {}) =>
    chain.view<T | null>(coreId, method, args);
  const act = (method: string, args: Record<string, unknown>) => admin(chain, coreId, method, args);
  const data = buildCatalogue(deployerId);

  for (const { representation } of data.representations) {
    if (!(await chain.exists(representation.account_id))) {
      throw new Error(
        `${representation.account_id} is not deployed: run deploy-testnet with --catalogue first`,
      );
    }
  }
  await grantRoles(chain);

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

  for (const rel of data.relationships) {
    const { pair } = rel;
    const name = `${pair.representation_a_id}:${pair.representation_b_id}`;
    const current = await core<RegistryRecord>("get_compatibility", pair);
    if (!current) {
      await act("propose_compatibility", {
        ...pair,
        classification: rel.classification,
        ratio: rel.ratio,
        scope: rel.scope,
        rationale: rel.rationale,
      });
      console.log(`proposed ${name}`);
    }
    if (!current || current.evidence.length === 0) {
      await act("add_compatibility_evidence", { ...pair, evidence: rel.evidence });
      console.log(`added compatibility evidence to ${name}`);
    }
    if (!rel.approve) {
      console.log(`left ${name} proposed: the contract approves only active representations`);
    } else if (!current || current.status === "proposed") {
      await act("approve_compatibility", { ...pair, rationale: rel.approval_rationale });
      console.log(`approved ${name} as ${rel.classification}`);
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
