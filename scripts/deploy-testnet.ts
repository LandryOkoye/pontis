// Deploys synthetic-token twice (TGOLD-A, TGOLD-B) and pontis-core to sub-accounts of the
// deployer and initialises them. With --catalogue[=mvp|demo|full] it also deploys one
// synthetic-token per representation of that catalogue tier (scripts/lib/catalogue-tiers.ts) on
// `<representation id>.<deployer>`; a bare --catalogue means `demo`, no flag means `mvp` (none).
// Idempotent: an account whose contract already answers its owner view is not re-initialised,
// and code is only replaced with --redeploy.
//
//   pnpm --filter @pontis/scripts deploy-testnet [--redeploy] [--catalogue[=mvp|demo|full]]
//
// Needs built wasm (scripts/build-contracts.sh) and DEPLOYER_ACCOUNT_ID plus a key; see
// docs/architecture/deployments.md; the result is written to docs/architecture/deployment-record.md.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Account, KeyPair, JsonRpcProvider } from "near-api-js";
import { assertDeployerKey, connect, type Chain } from "./lib/chain.ts";
import { loadConfig } from "./lib/config.ts";
import { catalogueFor, tierFromArgs, type CatalogueTier } from "./lib/catalogue-tiers.ts";
import { REPO_ROOT } from "./lib/evidence.ts";
import {
  catalogueTargets,
  fundingFor,
  renderDeployments,
  targets,
  wasmPath,
  type Target,
} from "./lib/deploy-plan.ts";

async function ensureAccount(chain: Chain, target: Target, funding: bigint): Promise<void> {
  if (await chain.exists(target.accountId)) return;
  const suffix = `.${chain.config.deployerId}`;
  if (!target.accountId.endsWith(suffix)) {
    throw new Error(
      `${target.accountId} does not exist and is not a sub-account of ${chain.config.deployerId}`,
    );
  }
  const publicKey = KeyPair.fromString(
    chain.config.deployerKey as `ed25519:${string}`,
  ).getPublicKey();
  await chain.account.createSubAccount({
    accountOrPrefix: target.accountId.slice(0, -suffix.length),
    publicKey,
    nearToTransfer: funding,
  });
  console.log(`created ${target.accountId}`);
}

export async function deploy(
  chain: Chain,
  redeploy: boolean,
  options: { catalogue?: CatalogueTier } = {},
): Promise<void> {
  await assertDeployerKey(chain);
  const { config } = chain;
  const rows: { label: string; accountId: string; codeHash: string }[] = [];
  const provider = new JsonRpcProvider({ url: config.rpcUrl });
  const plan = [
    ...targets(config.deployerId, {
      core: config.coreId,
      a: config.tokenAId,
      b: config.tokenBId,
    }),
    ...catalogueTargets(config.deployerId, catalogueFor(options.catalogue ?? "mvp")),
  ];
  for (const target of plan) {
    const code = readFileSync(wasmPath(target.wasm));
    await ensureAccount(chain, target, fundingFor(code.length));
    const owner = await chain
      .view<string>(target.accountId, target.ownerView)
      .catch(() => undefined);
    const signer = new Account(
      target.accountId,
      provider,
      config.deployerKey as `ed25519:${string}`,
    );
    if (owner === undefined || redeploy) {
      await signer.deployContract(code);
      console.log(`deployed ${target.wasm} to ${target.accountId}`);
    }
    if (owner === undefined) {
      await signer.callFunction({
        contractId: target.accountId,
        methodName: "new",
        args: target.init,
        gas: 100_000_000_000_000n,
        waitUntil: "FINAL",
      });
      console.log(`initialised ${target.accountId}`);
    } else {
      console.log(`${target.accountId} already initialised (owner ${owner}); init skipped`);
    }
    rows.push({
      label: target.label,
      accountId: target.accountId,
      codeHash: createHash("sha256").update(code).digest("hex"),
    });
  }
  const date = new Date().toISOString().slice(0, 10);
  // The end-to-end run deploys to a throwaway sandbox and must not rewrite the committed record.
  const record =
    process.env.DEPLOYMENTS_FILE ?? `${REPO_ROOT}/docs/architecture/deployment-record.md`;
  writeFileSync(
    record,
    renderDeployments({ networkId: config.networkId, deployerId: config.deployerId, rows, date }),
  );
  console.log(`wrote ${record}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await deploy(connect(loadConfig()), process.argv.includes("--redeploy"), {
    catalogue: tierFromArgs(process.argv.slice(2), "mvp"),
  });
}
