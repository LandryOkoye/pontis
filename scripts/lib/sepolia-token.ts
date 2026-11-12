import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider } from "near-api-js";
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { loadConfig } from "./config.ts";

export const tokenAbi = parseAbi([
  "function bridge() view returns (address)",
  "function eligible(address) view returns (bool)",
  "function setEligible(address account, bool isEligible)",
  "function bridgeMint(address recipient, uint256 amount)",
]);

const TOKEN_ARTIFACT = resolve(
  process.cwd(),
  "../contracts-evm/out/PermissionedBridgeToken.sol/PermissionedBridgeToken.json",
);

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function nearSigner() {
  const config = loadConfig();
  if (config.networkId !== "testnet")
    throw new Error("Chain Signatures signing requires NEAR Testnet");
  const provider = new JsonRpcProvider({ url: config.rpcUrl });
  return {
    account: new Account(config.deployerId, provider, config.deployerKey as `ed25519:${string}`),
    accountId: config.deployerId,
  };
}

export function evmClients() {
  const rpcUrl = required("SEPOLIA_RPC_URL");
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  return { rpcUrl, publicClient };
}

export async function assertSepolia(
  publicClient: ReturnType<typeof createPublicClient>,
): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== sepolia.id)
    throw new Error(`Expected Sepolia chain id ${sepolia.id}, received ${chainId}`);
}

export function readTokenArtifact(): { abi: typeof tokenAbi; bytecode: { object: Hex } } {
  return JSON.parse(readFileSync(TOKEN_ARTIFACT, "utf8")) as {
    abi: typeof tokenAbi;
    bytecode: { object: Hex };
  };
}
