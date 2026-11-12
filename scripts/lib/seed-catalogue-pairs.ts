// The relationship steps of the catalogue seed: propose, attach evidence, approve or reject, and
// set the guard of an approved pair. Each step reads current state first, so re-running is safe.

import { admin, type Chain } from "./chain.ts";
import type { PlannedRelationship } from "./catalogue-plan.ts";
import type { RegistryRecord } from "./seed-registry.ts";

export async function seedRelationship(chain: Chain, rel: PlannedRelationship): Promise<void> {
  const { coreId } = chain.config;
  const { pair } = rel;
  const name = `${pair.representation_a_id}:${pair.representation_b_id}`;
  const act = (method: string, args: Record<string, unknown>) => admin(chain, coreId, method, args);
  const current = await chain.view<RegistryRecord | null>(coreId, "get_compatibility", pair);

  if (!current) {
    await act("propose_compatibility", {
      ...pair,
      classification: rel.classification,
      ratio: rel.ratio,
      scope: rel.scope,
      rationale: rel.rationale,
    });
    console.log(`proposed ${name} as ${rel.classification}`);
  }
  if (!current || current.evidence.length === 0) {
    await act("add_compatibility_evidence", { ...pair, evidence: rel.evidence });
    console.log(`added compatibility evidence to ${name}`);
  }
  const proposed = !current || current.status === "proposed";
  if (rel.reject) {
    if (proposed) {
      await act("reject_compatibility", { ...pair, rationale: rel.approval_rationale });
      console.log(`rejected ${name}`);
    }
    return;
  }
  if (!rel.approve) {
    console.log(`left ${name} proposed: ${rel.approval_rationale}`);
    return;
  }
  if (proposed) {
    await act("approve_compatibility", { ...pair, rationale: rel.approval_rationale });
    console.log(`approved ${name} as ${rel.classification}`);
  }
  if (rel.guard && !(await chain.view<unknown>(coreId, "get_route_guard", pair))) {
    await act("set_route_guard", { ...pair, guard: rel.guard });
    console.log(`set the guard of ${name}`);
  }
}
