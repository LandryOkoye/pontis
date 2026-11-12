// What a catalogue tier costs to put on a chain: NEAR, transactions and (estimated) time. Every
// representation is a deployed token account, which is the cost that scales with the catalogue.
// The figures are derived from the plan and the deploy script's funding rule; nothing here was
// measured on a chain, and the latencies below are assumptions, not observations.

import { buildCatalogue } from "./catalogue-plan.ts";
import { catalogueFor, type CatalogueTier } from "./catalogue-tiers.ts";
import { fundingFor } from "./deploy-plan.ts";
import { estimateStateBytes, STORAGE_BYTE_COST } from "./seed-catalogue-funding.ts";

const NEAR = 10n ** 24n;
/** `synthetic_token.wasm` of the slim build, the size docs/architecture/deployments.md records. */
export const SLIM_TOKEN_WASM_BYTES = 179_598;
/** Assumed time for one transaction to reach FINAL finality: a public testnet, and a local sandbox. */
export const ASSUMED_FINAL_LATENCY_MS = { testnet: 2_500, sandbox: 600 } as const;
/** Assumed NEAR the deployer burns in gas per transaction (a call uses a few Tgas; 1 Tgas is about 0.0001 NEAR). */
const ASSUMED_GAS_NEAR_PER_TX = 0.002;

export interface CatalogueCost {
  tier: CatalogueTier;
  issuers: number;
  claims: number;
  representations: number;
  relationships: number;
  /** Token accounts the deploy creates: one per representation. */
  tokenAccounts: number;
  /** yoctoNEAR the deploy sends to each token account (0.00001 NEAR per wasm byte plus 1 NEAR). */
  perTokenAccount: bigint;
  /** yoctoNEAR for all token accounts. */
  tokenAccountsTotal: bigint;
  /** yoctoNEAR of registry storage the core account must hold for the catalogue. */
  coreStorage: bigint;
  /** NEAR the deployer burns in gas, estimated. */
  gasNear: number;
  deployTransactions: number;
  seedTransactions: number;
  /** Seconds to deploy and seed on a public testnet and on a sandbox, estimated. */
  seconds: { testnet: number; sandbox: number };
}

/** Transactions the seed sends on a fresh chain for the tier (views are not counted). */
export function seedTransactionCount(tier: CatalogueTier): number {
  const plan = buildCatalogue("pontis.testnet", undefined, catalogueFor(tier));
  let n = plan.representations.length === 0 ? 0 : 1; // the core top-up (the MVP seed granted the roles)
  for (const { activate, finalStatus } of plan.issuers) {
    n += 2 + (activate ? 1 : 0) + (finalStatus === (activate ? "active" : "restricted") ? 0 : 1);
  }
  n += plan.claims.length * 3;
  const issuerActivates = new Map(plan.issuers.map((i) => [i.record.id, i.activate]));
  for (const {
    representation,
    activate,
    vaultInventory,
    faucet,
    finalStatus,
  } of plan.representations) {
    const active = activate && issuerActivates.get(representation.issuer_id) === true;
    n += 2 + (active ? 1 : 0) + (active && finalStatus !== "active" ? 1 : 0);
    n += 2 + (faucet ? 0 : 1); // mint and allowlist, and the faucet switch-off
    n += vaultInventory > 0n ? 2 : 0; // storage deposit and fund_vault
  }
  for (const rel of plan.relationships) {
    n += 2 + (rel.reject ? 1 : rel.approve ? 1 + (rel.guard ? 1 : 0) : 0);
  }
  return n;
}

export function catalogueCost(
  tier: CatalogueTier,
  tokenWasmBytes: number = SLIM_TOKEN_WASM_BYTES,
): CatalogueCost {
  const data = catalogueFor(tier);
  const plan = buildCatalogue("pontis.testnet", undefined, data);
  const perTokenAccount = fundingFor(tokenWasmBytes);
  const payloads = [
    ...plan.issuers.flatMap((i) => [i.record, i.evidence]),
    ...plan.claims.flatMap((c) => [c.asset, c.evidence]),
    ...plan.representations.flatMap((r) => [r.representation, r.evidence]),
    ...plan.relationships.flatMap((r) => [
      { pair: r.pair, ratio: r.ratio, scope: r.scope, rationale: r.rationale },
      r.evidence,
    ]),
  ];
  const deployTransactions = data.representations.length * 3; // create account, deploy code, init
  const seedTransactions = seedTransactionCount(tier);
  const transactions = deployTransactions + seedTransactions;
  return {
    tier,
    issuers: data.issuers.length,
    claims: data.claims.length,
    representations: data.representations.length,
    relationships: data.relationships.length,
    tokenAccounts: data.representations.length,
    perTokenAccount,
    tokenAccountsTotal: perTokenAccount * BigInt(data.representations.length),
    coreStorage:
      payloads.length === 0 ? 0n : BigInt(estimateStateBytes(payloads)) * STORAGE_BYTE_COST,
    gasNear: transactions * ASSUMED_GAS_NEAR_PER_TX,
    deployTransactions,
    seedTransactions,
    seconds: {
      testnet: Math.round((transactions * ASSUMED_FINAL_LATENCY_MS.testnet) / 1_000),
      sandbox: Math.round((transactions * ASSUMED_FINAL_LATENCY_MS.sandbox) / 1_000),
    },
  };
}

/** NEAR with two decimals, rounded up so a stated cost is never below the real one. */
export function nearText(yocto: bigint): string {
  const cents = (yocto * 100n + NEAR - 1n) / NEAR;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function renderCost(cost: CatalogueCost): string {
  const total = cost.tokenAccountsTotal + cost.coreStorage;
  return [
    `tier ${cost.tier}: ${cost.issuers} issuers, ${cost.claims} claims, ${cost.representations} representations, ${cost.relationships} relationships`,
    `  token accounts:   ${cost.tokenAccounts} x ${nearText(cost.perTokenAccount)} NEAR = ${nearText(cost.tokenAccountsTotal)} NEAR (the deploy sends this; about 1 NEAR of each stays spendable)`,
    `  core registry:    about ${nearText(cost.coreStorage)} NEAR of storage (the seed tops the core account up)`,
    `  gas (estimate):   about ${cost.gasNear.toFixed(1)} NEAR`,
    `  deployer needs:   about ${nearText(total + BigInt(Math.ceil(cost.gasNear * 100)) * (NEAR / 100n))} NEAR for the catalogue, on top of the MVP deploy`,
    `  transactions:     ${cost.deployTransactions} deploy + ${cost.seedTransactions} seed`,
    `  time (assumed):   about ${Math.ceil(cost.seconds.testnet / 60)} min on a testnet at ${ASSUMED_FINAL_LATENCY_MS.testnet} ms per final transaction, about ${Math.ceil(cost.seconds.sandbox / 60)} min on a sandbox at ${ASSUMED_FINAL_LATENCY_MS.sandbox} ms`,
  ].join("\n");
}
