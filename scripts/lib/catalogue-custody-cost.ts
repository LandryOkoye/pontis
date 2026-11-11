// What the custody seed of a tier costs on top of the catalogue: transactions, NEAR and (estimated)
// time. Derived from the plan, like scripts/lib/catalogue-cost.ts; nothing here was measured on a
// chain, and the per-transaction gas and finality figures are the same assumptions.

import { buildCatalogue } from "./catalogue-plan.ts";
import { ASSUMED_FINAL_LATENCY_MS, nearText } from "./catalogue-cost.ts";
import { custodianArgs, linkArgs, policyArgs, termsArgs } from "./catalogue-custody-plan.ts";
import { custodyFor } from "./catalogue-custody-tiers.ts";
import { catalogueFor, type CatalogueTier } from "./catalogue-tiers.ts";
import { estimateStateBytes, STORAGE_BYTE_COST } from "./seed-catalogue-funding.ts";

const ASSUMED_GAS_NEAR_PER_TX = 0.002;
/** A latest record plus a history entry per attestation, with the report URI. */
const ATTESTATION_BYTES = 700;

export interface CustodyCost {
  tier: CatalogueTier;
  custodians: number;
  linked: number;
  attestations: number;
  terms: number;
  redemptions: number;
  /** Transactions on a fresh chain: the catalogue seed has granted the registrar role already. */
  transactions: number;
  /** yoctoNEAR of registry storage for the custody records. */
  storage: bigint;
  gasNear: number;
  seconds: { testnet: number; sandbox: number };
}

export function custodyCost(tier: CatalogueTier): CustodyCost {
  const data = custodyFor(tier);
  if (data.custodians.length === 0) {
    return {
      tier,
      custodians: 0,
      linked: 0,
      attestations: 0,
      terms: 0,
      redemptions: 0,
      transactions: 0,
      storage: 0n,
      gasNear: 0,
      seconds: { testnet: 0, sandbox: 0 },
    };
  }
  const plan = buildCatalogue("pontis.testnet", undefined, catalogueFor(tier));
  const decimals = new Map(
    plan.representations.map((r) => [r.representation.id, r.representation.decimals]),
  );
  const vaulted = new Set(
    plan.representations.filter((r) => r.vaultInventory > 0n).map((r) => r.representation.id),
  );
  const attestations = data.custody.filter((c) => c.coverBps !== null).length;
  const gated = data.custody.filter((c) => c.gatedMint).length;
  // Request (plus the core's storage registration when the vault never registered it), accept, fulfil.
  const redemptionTx = data.redemptions.reduce(
    (n, r) =>
      n +
      1 +
      (vaulted.has(r.representationId) ? 0 : 1) +
      (r.state === "requested" ? 0 : 1) +
      (r.state === "fulfilled" ? 1 : 0),
    0,
  );
  const transactions =
    1 + // the core storage top-up
    2 + // grant reserve_attester, add_signer_key
    data.custodians.length +
    2 * data.custody.length +
    attestations +
    gated +
    data.terms.length +
    redemptionTx;
  const payloads = [
    ...data.custodians.map(custodianArgs),
    ...data.custody.flatMap((c) => [linkArgs(c), policyArgs(c, 0n)]),
    ...data.terms.map((t) => termsArgs(t, decimals.get(t.representationId) ?? 0)),
  ];
  const attestationBytes = attestations * ATTESTATION_BYTES;
  return {
    tier,
    custodians: data.custodians.length,
    linked: data.custody.length,
    attestations,
    terms: data.terms.length,
    redemptions: data.redemptions.length,
    transactions,
    storage: BigInt(estimateStateBytes(payloads) + attestationBytes) * STORAGE_BYTE_COST,
    gasNear: transactions * ASSUMED_GAS_NEAR_PER_TX,
    seconds: {
      testnet: Math.round((transactions * ASSUMED_FINAL_LATENCY_MS.testnet) / 1_000),
      sandbox: Math.round((transactions * ASSUMED_FINAL_LATENCY_MS.sandbox) / 1_000),
    },
  };
}

export function renderCustodyCost(cost: CustodyCost): string {
  if (cost.transactions === 0) return `  custody seed:     none (this tier has no custody data)`;
  return [
    `  custody seed:     ${cost.transactions} transactions (${cost.custodians} custodians, ${cost.linked} policies, ${cost.attestations} attestations, ${cost.terms} terms, ${cost.redemptions} redemptions)`,
    `  custody storage:  about ${nearText(cost.storage)} NEAR on the core account, plus about ${cost.gasNear.toFixed(1)} NEAR of gas (estimates)`,
    `  custody time:     about ${Math.ceil(cost.seconds.testnet / 60)} min on a testnet, about ${Math.ceil(cost.seconds.sandbox / 60)} min on a sandbox (assumed latency)`,
  ].join("\n");
}
