// Environment-specific configuration for deploy, seed and allowlist (BuildPlan B8).
// Testnet or a local sandbox only: these scripts refuse any other network.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const ALLOWED_NETWORKS = ["testnet", "sandbox"] as const;
export type NetworkId = (typeof ALLOWED_NETWORKS)[number];

export interface ChainConfig {
  readonly networkId: NetworkId;
  readonly rpcUrl: string;
  /** Account that owns every contract and holds every role. Testnet only. */
  readonly deployerId: string;
  /** `ed25519:...` secret key of the deployer. */
  readonly deployerKey: string;
  readonly coreId: string;
  readonly tokenAId: string;
  readonly tokenBId: string;
}

type Env = Record<string, string | undefined>;

const DEFAULT_RPC: Record<NetworkId, string> = {
  testnet: "https://rpc.testnet.near.org",
  sandbox: "http://127.0.0.1:3030",
};

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

/** Reads the deployer secret key from `DEPLOYER_PRIVATE_KEY` or the legacy NEAR CLI credentials file. */
export function loadDeployerKey(env: Env, networkId: NetworkId, deployerId: string): string {
  const fromEnv = env.DEPLOYER_PRIVATE_KEY?.trim();
  if (fromEnv) return fromEnv;
  const dir = env.NEAR_CREDENTIALS_DIR?.trim() || join(homedir(), ".near-credentials");
  const file = join(dir, networkId, `${deployerId}.json`);
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { private_key?: string };
    if (parsed.private_key) return parsed.private_key;
  } catch {
    // fall through to the error below
  }
  throw new Error(`No signing key: set DEPLOYER_PRIVATE_KEY or provide ${file}`);
}

export function loadConfig(env: Env = process.env): ChainConfig {
  const networkId = (env.NEAR_NETWORK_ID?.trim() || "testnet") as NetworkId;
  if (!ALLOWED_NETWORKS.includes(networkId)) {
    throw new Error(
      `NEAR_NETWORK_ID must be one of ${ALLOWED_NETWORKS.join(", ")}; mainnet is out of scope`,
    );
  }
  const deployerId = required(env, "DEPLOYER_ACCOUNT_ID");
  return {
    networkId,
    rpcUrl: env.NEAR_RPC_URL?.trim() || DEFAULT_RPC[networkId],
    deployerId,
    deployerKey: loadDeployerKey(env, networkId, deployerId),
    coreId: env.PONTIS_CORE_ACCOUNT_ID?.trim() || `pontis-core.${deployerId}`,
    tokenAId: env.TGOLD_A_ACCOUNT_ID?.trim() || `tgold-a.${deployerId}`,
    tokenBId: env.TGOLD_B_ACCOUNT_ID?.trim() || `tgold-b.${deployerId}`,
  };
}
