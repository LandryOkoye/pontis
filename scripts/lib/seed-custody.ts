// Seeds the fictional custody, reserve and redemption data of a tier (scripts/lib/catalogue-custody-*.ts)
// on top of the catalogue seed: custodians and links, reserve policies and the first simulated
// attestation of each story, redemption terms, and three simulated redemptions. Every step reads
// chain state first, so re-running is safe. Order matters:
//
//   1. the attester role and the dev signer key (owner), then custodians and links (registrar);
//   2. policies (the baseline is the token's supply now), then one attestation per story;
//   3. the core as minter of the gated tokens, then the terms, then the redemptions.
//
// EVERYTHING HERE IS SIMULATED. Nothing is custodied, backed, audited, regulated or paid out; the
// stories are reached with the contract's own mechanisms and the simulated custodian's dev key.

import { tokenAccount } from "./catalogue.ts";
import { buildCatalogue } from "./catalogue-plan.ts";
import { custodianArgs, linkArgs, policyArgs, termsArgs } from "./catalogue-custody-plan.ts";
import { custodyFor } from "./catalogue-custody-tiers.ts";
import { catalogueFor, DEFAULT_TIER, type CatalogueTier } from "./catalogue-tiers.ts";
import type { Chain } from "./chain.ts";
import { ensureStateFunding } from "./seed-catalogue-funding.ts";
import { seedPolicies } from "./seed-custody-policies.ts";
import { seedRedemptions } from "./seed-custody-redemptions.ts";
import {
  seedAttestations,
  skippedByPublisher,
  type ReserveSeedOptions,
} from "./seed-custody-reserves.ts";
import { seedAttesterRole, seedCustodians, seedLinks } from "./seed-custody-setup.ts";
import { seedGatedMinters, seedTerms, type RepLookup } from "./seed-custody-terms.ts";
import { grantRoles } from "./seed-registry.ts";

/** About what an attestation stores: its latest record and its history entry, with the report URI. */
const ATTESTATION_RECORDS = "x".repeat(700);

export interface CustodySeedOptions extends ReserveSeedOptions {
  /** Which tier to seed; `demo` when absent. `mvp` has no custody data. */
  tier?: CatalogueTier;
  /** Tops up the core account for the new registry state; the real top-up when absent. */
  fund?: (chain: Chain, payloads: readonly unknown[]) => Promise<unknown>;
  /** The chain handle that signs as an issuer's token account; the deployer's key on that account when absent. */
  officeFor?: (accountId: string) => Chain;
}

export async function seedCustody(chain: Chain, options: CustodySeedOptions = {}): Promise<void> {
  const tier = options.tier ?? DEFAULT_TIER;
  const { coreId, deployerId } = chain.config;
  const data = custodyFor(tier);
  if (data.custodians.length === 0) {
    console.log(`catalogue tier ${tier}: no custody data to seed`);
    return;
  }
  const plan = buildCatalogue(deployerId, undefined, catalogueFor(tier));
  const decimals = new Map(
    plan.representations.map((r) => [r.representation.id, r.representation.decimals]),
  );
  const reps: RepLookup = {
    accountOf: (id) => tokenAccount(id, deployerId),
    decimalsOf: (id) => decimals.get(id) ?? 0,
  };
  console.log(
    `seeding SIMULATED custody for the ${tier} catalogue: ${data.custodians.length} custodians, ${data.custody.length} linked representations, ${data.terms.length} redemption terms, ${data.redemptions.length} redemptions`,
  );
  const wanted = [...data.custody, ...data.terms, ...data.redemptions].map(
    (r) => r.representationId,
  );
  for (const id of new Set(wanted)) {
    if (!decimals.has(id))
      throw new Error(`custody data names ${id}, which the ${tier} catalogue lacks`);
    if (!(await chain.view(coreId, "get_representation", { id }))) {
      throw new Error(`${id} is not registered: run seed-catalogue --catalogue=${tier} first`);
    }
  }

  // The state the core has to store for what is not on chain yet.
  const pending: unknown[] = [];
  for (const c of data.custodians) {
    if (!(await chain.view(coreId, "get_custodian", { id: c.id }))) pending.push(custodianArgs(c));
  }
  for (const row of data.custody) {
    const id = { representation_id: row.representationId };
    if (!(await chain.view(coreId, "get_custody_link", id))) {
      pending.push(linkArgs(row), policyArgs(row, 0n), ATTESTATION_RECORDS);
    }
  }
  for (const t of data.terms) {
    const id = { representation_id: t.representationId };
    if (!(await chain.view(coreId, "get_redemption_terms", id)))
      pending.push(termsArgs(t, reps.decimalsOf(t.representationId)));
  }
  await (options.fund ?? ensureStateFunding)(chain, pending);

  await grantRoles(chain);
  await seedAttesterRole(chain);
  await seedCustodians(chain, data.custodians);
  await seedLinks(chain, data.custody);
  await seedPolicies(chain, data.custody, reps.accountOf);
  await seedAttestations(chain, data.custody, reps.accountOf, options);
  await seedGatedMinters(chain, data.custody, reps);
  await seedTerms(chain, data.terms, reps);
  await seedRedemptions(chain, data.redemptions, reps, options.officeFor);

  const skip = skippedByPublisher(data.custody);
  console.log(
    `\nSIMULATED custody seeded. The stories decay: a running publisher must leave ${skip.join(", ")} alone:\n  pnpm --filter @pontis/scripts reserves publish --loop ${skip.map((s) => `--skip ${s}`).join(" ")}`,
  );
}
