// The terms steps of the custody seed: redemption terms per redeemable representation and the gated
// minter the redemption burn needs (ADR 0020 sections 6 and 7). Every step reads chain state first.
// SIMULATED: the terms are fictional and nothing is ever paid out.

import { admin, type Chain } from "./chain.ts";
import { termsArgs } from "./catalogue-custody-plan.ts";
import type { PlannedCustody, PlannedTerms } from "./catalogue-custody-types.ts";

export interface TermsRecord {
  terms: Record<string, unknown>;
  terms_hash: string;
}

/** What the seed needs to know about a representation: its token account and its decimals. */
export interface RepLookup {
  accountOf: (representationId: string) => string;
  decimalsOf: (representationId: string) => number;
}

/** Sets the terms of every row whose on-chain terms are missing or different (the version rises). */
export async function seedTerms(
  chain: Chain,
  terms: readonly PlannedTerms[],
  reps: RepLookup,
): Promise<void> {
  const { coreId } = chain.config;
  for (const t of terms) {
    const args = termsArgs(t, reps.decimalsOf(t.representationId));
    const current = await chain.view<TermsRecord | null>(coreId, "get_redemption_terms", {
      representation_id: t.representationId,
    });
    if (current && JSON.stringify(current.terms) === JSON.stringify(args.terms)) continue;
    await admin(chain, coreId, "set_redemption_terms", args);
    console.log(`${t.representationId} redemption terms set (SIMULATED issuer terms)`);
  }
}

/** Makes the core the minter of every gated token, so the redemption burn and the gated mint work. */
export async function seedGatedMinters(
  chain: Chain,
  rows: readonly PlannedCustody[],
  reps: RepLookup,
): Promise<void> {
  const { coreId } = chain.config;
  for (const row of rows.filter((r) => r.gatedMint)) {
    const token = reps.accountOf(row.representationId);
    if ((await chain.view<string | null>(token, "get_minter", {})) === coreId) continue;
    await admin(chain, token, "set_minter", { minter: coreId });
    console.log(`${token}: minter set to ${coreId}; only gated mints can create supply`);
  }
}
