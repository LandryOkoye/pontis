// The policy step of the custody seed: one reserve policy per linked representation (owner call
// `set_reserve_policy`, ADR 0020 section 4). Reads chain state first. SIMULATED stories only.

import { admin, type Chain } from "./chain.ts";
import { policyArgs } from "./catalogue-custody-plan.ts";
import type { PlannedCustody } from "./catalogue-custody-types.ts";
import { tokenSupply } from "./reserve-chain.ts";

interface PolicyView {
  tolerance_bps: number;
  max_reserve_age_ms: number;
  action: string;
  baseline_supply: string;
}
/** Sets the policy of every row; the baseline is the token's supply now, fixed by the contract after. */
export async function seedPolicies(
  chain: Chain,
  rows: readonly PlannedCustody[],
  accountOf: (representationId: string) => string,
): Promise<void> {
  const { coreId } = chain.config;
  for (const row of rows) {
    const id = row.representationId;
    const current = await chain.view<PolicyView | null>(coreId, "get_reserve_policy", {
      representation_id: id,
    });
    const same =
      current?.action === row.policy.action &&
      current.tolerance_bps === row.policy.toleranceBps &&
      current.max_reserve_age_ms === row.policy.maxReserveAgeMs;
    if (same) continue;
    const baseline = current
      ? BigInt(current.baseline_supply)
      : await tokenSupply(chain.view.bind(chain), accountOf(id));
    await admin(chain, coreId, "set_reserve_policy", policyArgs(row, baseline));
    console.log(`${id} reserve policy set: ${row.story} (${row.policy.action}, SIMULATED)`);
  }
}
