// Seeds the registry steps: roles, issuers, claim, representations and the relationship.
// Each step reads current state first, so re-running is safe.

import { admin, type Chain } from "./chain.ts";
import { buildSeed } from "./seed-data.ts";

const ROLES = ["registrar", "compat_approver", "pauser"] as const;

interface RegistryRecord {
  status: string;
  evidence: unknown[];
}

export async function seedRegistry(chain: Chain): Promise<void> {
  const { coreId, tokenAId, tokenBId, deployerId } = chain.config;
  const core = <T>(method: string, args: Record<string, unknown> = {}) =>
    chain.view<T | null>(coreId, method, args);
  const act = (method: string, args: Record<string, unknown>) => admin(chain, coreId, method, args);
  const data = buildSeed({ tokenA: tokenAId, tokenB: tokenBId });

  for (const role of ROLES) {
    if (!(await core<boolean>("has_role", { role, account_id: deployerId }))) {
      await act("grant_role", { role, account_id: deployerId });
      console.log(`granted ${role} to ${deployerId}`);
    }
  }

  const ensure = async (
    label: string,
    subjectType: string,
    id: string,
    current: RegistryRecord | null | undefined,
    register: () => Promise<unknown>,
    evidence: unknown,
    activate: string,
  ) => {
    if (!current) {
      await register();
      console.log(`registered ${label} ${id}`);
    }
    if (!current || current.evidence.length === 0) {
      await act("add_evidence", { subject_type: subjectType, subject_id: id, evidence });
      console.log(`added evidence to ${label} ${id}`);
    }
    if (!current || current.status !== "active") {
      await act(activate, { id, status: "active" });
      console.log(`activated ${label} ${id}`);
    }
  };

  for (const issuer of data.issuers) {
    const { evidence, ...record } = issuer;
    await ensure(
      "issuer",
      "issuer",
      issuer.id,
      await core<RegistryRecord>("get_issuer", { id: issuer.id }),
      () => act("register_issuer", { issuer: record }),
      evidence,
      "set_issuer_status",
    );
  }
  const claim = data.canonicalAsset;
  await ensure(
    "canonical asset",
    "canonical_asset",
    claim.asset.id,
    await core<RegistryRecord>("get_canonical_asset", { id: claim.asset.id }),
    () => act("register_canonical_asset", { asset: claim.asset }),
    claim.evidence,
    "set_canonical_asset_status",
  );
  for (const { representation, evidence } of data.representations) {
    await ensure(
      "representation",
      "representation",
      representation.id,
      await core<RegistryRecord>("get_representation", { id: representation.id }),
      () => act("register_representation", { representation }),
      evidence,
      "set_representation_status",
    );
  }

  const pair = { representation_a_id: "tgold-a", representation_b_id: "tgold-b" };
  const rel = data.compatibility;
  const current = await core<RegistryRecord & { status: string }>("get_compatibility", pair);
  if (!current) {
    await act("propose_compatibility", {
      ...pair,
      classification: rel.classification,
      ratio: rel.ratio,
      scope: rel.scope,
      rationale: rel.rationale,
    });
    console.log("proposed tgold-a:tgold-b");
  }
  if (!current || current.evidence.length === 0) {
    await act("add_compatibility_evidence", { ...pair, evidence: rel.evidence });
    console.log("added compatibility evidence");
  }
  if (!current || current.status === "proposed") {
    await act("approve_compatibility", { ...pair, rationale: rel.approval_rationale });
    console.log("approved tgold-a:tgold-b as DIRECT_EQUIVALENT");
  }
}
